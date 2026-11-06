#!/usr/bin/env node
import net from 'node:net';
import { mkdtempSync, chmodSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { ScanSession } from '../src/scan-session.mjs';
import { JsonLineDecoder } from '../src/jsonl.mjs';

function options(argv) {
  const raw = new Map();
  for (const item of argv) {
    const match = item.match(/^--([a-z-]+)=(.*)$/);
    if (!match || raw.has(match[1])) throw new Error('Use --seconds=N --window-seconds=N --app=/path/to/palantiny-sensor.app');
    raw.set(match[1], match[2]);
  }
  for (const key of raw.keys()) if (!['seconds','window-seconds','app'].includes(key)) throw new Error(`Unknown option: --${key}`);
  const seconds=Number(raw.get('seconds')??90);
  const windowSeconds=Number(raw.get('window-seconds')??20);
  if (!Number.isSafeInteger(seconds)||seconds<30||seconds>1800) throw new RangeError('seconds must be 30..1800');
  if (!Number.isSafeInteger(windowSeconds)||windowSeconds<10||windowSeconds>300) throw new RangeError('window-seconds must be 10..300');
  return { seconds, windowSeconds, app:path.resolve(raw.get('app')??'../palantiny/native/macos/build/palantiny-sensor.app') };
}

async function main() {
  const opts=options(process.argv.slice(2));
  if (process.platform!=='darwin') throw new Error('Live scanner requires macOS. Tests are cross-platform.');
  if (!existsSync(opts.app)) throw new Error(`Palantiny sensor app not found: ${opts.app}. See docs/LOCAL_SCAN.md`);

  const directory=mkdtempSync(path.join(tmpdir(),'pulsemesh-scan-'));
  chmodSync(directory,0o700);
  const socketPath=path.join(directory,'sensor.sock');
  const session=new ScanSession({windowSeconds:opts.windowSeconds});
  let client=null, closed=false, requestedStop=false;
  let resolveConnect, resolveInterrupt;
  const connection=new Promise(resolve=>{resolveConnect=resolve});
  const interruption=new Promise(resolve=>{resolveInterrupt=resolve});
  const onSignal=()=>{requestedStop=true;resolveInterrupt('interrupted')};
  process.on('SIGINT',onSignal);
  process.on('SIGTERM',onSignal);
  const timers=[];
  const server=net.createServer(socket=>{
    if(closed||client){socket.destroy();return}
    client=socket;
    session.onConnected();
    resolveConnect('connected');
    const decoder=new JsonLineDecoder({
      onLine:line=>session.onLine(line),
      onDropped:()=>session.onDroppedLine()
    });
    socket.on('data',bytes=>decoder.push(bytes));
    socket.on('error',()=>{});
    socket.on('close',()=>{decoder.close();session.onDisconnected()});
  });
  try {
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(socketPath,()=>{server.removeListener('error',reject);resolve()});
    });
    chmodSync(socketPath,0o600);
    console.log(`PulseMesh local scan: ${opts.seconds}s / ${opts.windowSeconds}s windows`);
    console.log('External network: DISABLED. Identifiers: memory-only.');
    await new Promise((resolve,reject)=>execFile('open',
      ['-n',opts.app,'--args','--socket',socketPath],
      error=>error?reject(error):resolve()));
    const ready=await Promise.race([
      connection,
      new Promise(resolve=>timers.push(setTimeout(()=>resolve('timeout'),20_000))),
      interruption
    ]);
    if(ready==='timeout') throw new Error('Scanner did not connect in 20 seconds; check macOS permissions');
    if(ready!=='connected') return;
    console.log('scanner=connected');
    timers.push(setInterval(()=>session.tick(),1000));
    timers.push(setInterval(()=>console.log(JSON.stringify(session.progress())),5000));
    const end=await Promise.race([
      new Promise(resolve=>timers.push(setTimeout(()=>resolve('completed'),opts.seconds*1000))),
      interruption,
      new Promise(resolve=>client.once('close',()=>resolve('disconnected')))
    ]);
    if(end!=='completed') requestedStop=true;
    const report=session.summary();
    if(requestedStop) report.complete=false;
    console.log('scan_done');
    console.log(JSON.stringify(report,null,2));
  } finally {
    closed=true;
    for(const timer of timers) clearTimeout(timer);
    process.removeListener('SIGINT',onSignal);
    process.removeListener('SIGTERM',onSignal);
    if(client) client.destroy();
    await new Promise(resolve=>server.close(resolve));
    session.clearSensitiveState();
    rmSync(directory,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(`scan failed: ${error.message}`);process.exitCode=1});
