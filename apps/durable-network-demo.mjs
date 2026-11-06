#!/usr/bin/env node
/**
 * M05: three separate Node processes (2 contributors + 1 indexer),
 * synthetic signed observations, durable outboxes, encrypted P2P transport.
 * Indexer restart + lost-ACK retry tests persistence and idempotence.
 */
import { fork } from 'node:child_process';
import { mkdtempSync,rmSync,mkdirSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openLocalIdentity } from '../src/identity.mjs';

const root=mkdtempSync(path.join(tmpdir(),'pulsemesh-m05-'));
const fixedNow=Date.now();
const bucketStart=Math.floor((fixedNow-20*60_000)/60_000)*60_000;
const workerFile=fileURLToPath(new URL('./m05-worker.mjs',import.meta.url));
const workers=new Set();
const timeLimit=12_000;
let requestSequence=0;

function start(role,directory,allowed=[]) {
  const child=fork(workerFile,[],{
    stdio:['ignore','ignore','pipe','ipc'],
    env:{...process.env,ROLE:role,STATE_DIR:directory,
      ALLOWED_KEYS:JSON.stringify(allowed),FIXED_NOW:String(fixedNow)}
  });
  workers.add(child);
  let stderr='';
  child.stderr.on('data',buf=>{stderr+=buf.toString().slice(0,1024);});
  const ready=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error(`M05 ${role} timed out starting: ${stderr}`)),timeLimit);
    const handler=message=>{
      if(message?.type!=='ready')return;
      clearTimeout(timer);child.off('exit',exitHandler);child.off('message',handler);
      if(!message.address || !message.peerId)reject(new Error('Missing ready address'));
      else resolve(message);
    };
    const exitHandler=code=>{
      clearTimeout(timer);child.off('message',handler);
      reject(new Error(`M05 ${role} exited early ${code}: ${stderr}`));
    };
    child.on('message',handler);child.once('exit',exitHandler);
  });
  return {child,ready};
}
function command(child,action,fields={}) {
  const id=++requestSequence;
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{
      child.off('message',handler);
      reject(new Error(`Timed out during ${action}`));
    },timeLimit);
    const handler=msg=>{
      if(msg?.type!=='response'||msg.id!==id)return;
      clearTimeout(timer);child.off('message',handler);
      if(msg.error)reject(new Error(msg.error));else resolve(msg);
    };
    child.on('message',handler);
    child.send({id,action,...fields},err=>{
      if(err){clearTimeout(timer);child.off('message',handler);reject(err);}
    });
  });
}
async function stop(child) {
  if(!child || child.exitCode !== null || !child.connected)return;
  await command(child,'stop');
  await new Promise(resolve=>{
    if(child.exitCode!==null)return resolve();
    const timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},3000);
    child.once('exit',()=>{clearTimeout(timer);resolve();});
  });
  workers.delete(child);
}
async function main() {
  const aDir=path.join(root,'sensor-a'),bDir=path.join(root,'sensor-b'),indexDir=path.join(root,'indexer');
  for(const dir of [aDir,bDir,indexDir])mkdirSync(dir,{mode:0o700});
  const aKey=openLocalIdentity(path.join(aDir,'identity')).keyId;
  const bKey=openLocalIdentity(path.join(bDir,'identity')).keyId;
  const authorized=[aKey,bKey];
  const a=start('contributor',aDir),b=start('contributor',bDir);
  let indexer=start('indexer',indexDir,authorized);
  const [aReady,bReady,indexReady]=await Promise.all([a.ready,b.ready,indexer.ready]);
  const address=info=>{
    if(!/^\/ip4\/127\.0\.0\.1\/tcp\/\d+/.test(info.address))
      throw new Error('Non-loopback address');
    const suffix=info.address.includes('/p2p/')?'':'/p2p/'+info.peerId;
    return info.address+suffix;
  };

  const first=await command(a.child,'prepare',{bucketStart,aliases:25});
  const second=await command(b.child,'prepare',{bucketStart,aliases:35});
  if(!first.outcome.ok || !second.outcome.ok)throw new Error('Synthetic outbox prepare failed');

  // Lost-ACK simulation: receiver commits and ACKs but sender deliberately
  // leaves its durable outbox item queued.
  const firstDelivery=await command(a.child,'send',{address:address(indexReady),honorAck:false});
  if(!firstDelivery.delivered || firstDelivery.stats.queued!==1)
    throw new Error('Lost ACK simulation failed to keep queued report');

  await stop(indexer.child); // Restart the aggregate database process.
  indexer=start('indexer',indexDir,authorized);
  const restarted=await indexer.ready;
  const state=await command(indexer.child,'query');
  if(state.stats.accepted!==1 || state.rows.length!==0)
    throw new Error('Indexer failed to persist first report across restart');

  const retried=await command(a.child,'send',{address:address(restarted)});
  if(!retried.delivered || !retried.response.duplicate ||
     retried.stats.acknowledged!==1 || retried.stats.queued!==0)
    throw new Error('Duplicate ACK did not reconcile durable outbox');
  const deliveredB=await command(b.child,'send',{address:address(restarted)});
  if(!deliveredB.delivered || deliveredB.stats.acknowledged!==1)
    throw new Error('Second delivery failed');

  const completed=await command(indexer.child,'query');
  if(completed.stats.accepted!==2 || completed.rows.length!==1 ||
     completed.rows[0].sources!==2 || completed.rows[0].relativeBleActivity!==30)
    throw new Error('Durable regional query does not match synthetic inputs');

  await Promise.all([stop(a.child),stop(b.child),stop(indexer.child)]);
  console.log(JSON.stringify({
    simulation:true,realSensorData:false,network:'encrypted_localhost_only',
    processCount:3,transport:'libp2p-tcp-noise-yamux',
    indexerRestarted:true,
    lostAckRecovered:retried.response.duplicate,
    contributorOutboxesAcknowledged:true,
    durableReports:completed.stats.accepted,
    regionalSeries:completed.rows,
    note:'Synthetic measurements only; neither public anonymity nor BLE footfall accuracy has been established.'
  },null,2));
}
try {
  await main();
} finally {
  await Promise.allSettled([...workers].map(async child=>{
    if(child.exitCode===null){child.kill('SIGKILL');}
  }));
  rmSync(root,{recursive:true,force:true});
}
