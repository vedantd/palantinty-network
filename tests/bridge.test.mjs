import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JsonLineDecoder } from '../src/jsonl.mjs';
import { LocalActivityPipeline } from '../src/activity-pipeline.mjs';
import { startPalantinyBridge } from '../src/palantiny-bridge.mjs';

const base = Date.UTC(2026, 10, 6, 12);
const listen = (server, name) => new Promise((done, fail) => {
  server.once('error', fail);
  server.listen(name, () => { server.removeListener('error', fail); done(); });
});
const connect = name => new Promise((done, fail) => {
  const socket = net.createConnection({ path: name });
  socket.once('connect', () => { socket.removeListener('error', fail); done(socket); });
  socket.once('error', fail);
});
const closeServer = server => new Promise(done => server.close(done));

test('JSONL parser handles CRLF and fragmented frames', () => {
  const lines = [];
  const decoder = new JsonLineDecoder({ onLine: line => lines.push(line) });
  decoder.push('hello\r\n{"t":"ble"');
  decoder.push('}\n\nend\n');
  assert.deepEqual(lines, ['hello', '{"t":"ble"}', 'end']);
});
test('oversized lines drop without corrupting the next record', () => {
  const lines = [], drops = [];
  const d = new JsonLineDecoder({ maxLineBytes: 32, onLine: x => lines.push(x), onDropped: x => drops.push(x) });
  d.push('A'.repeat(80));
  d.push('\nOK\n');
  assert.deepEqual(lines, ['OK']);
  assert.deepEqual(drops, ['oversize']);
});
test('complete BLE window is delayed and never exports an observed ID', () => {
  let now = base + 3000;
  const exported = [];
  const pipeline = new LocalActivityPipeline({
    clock: () => now, policy: { consent: true, area: 'coarse-demo-zone', delayMs: 60_000 },
    onReport: x => exported.push(x)
  });
  pipeline.sensorConnected();
  assert.equal(pipeline.accept({t:'ble',ts:base + 5000,id:'partial',rssi:-60}), false);
  now = base + 60_000;
  for (let i=0;i<25;i++) assert.equal(pipeline.accept({t:'ble',ts:now,id:'private-'+i,rssi:-60}),true);
  now = base + 120_000;
  assert.deepEqual(pipeline.tick(), []);
  now = base + 180_000;
  assert.equal(pipeline.tick().length,1);
  assert.equal(JSON.stringify(exported).includes('private-'), false);
});
test('sensor disconnect and revocation prevent release', () => {
  let now = base;
  const p = new LocalActivityPipeline({clock:()=>now,policy:{consent:true,area:'coarse-demo-zone',delayMs:60_000}});
  p.sensorConnected();
  now += 60_000;
  for(let i=0;i<25;i++) p.accept({t:'ble',ts:now+100,id:'local-'+i,rssi:-60});
  p.sensorDisconnected();
  now += 60_000;
  assert.deepEqual(p.tick(),[]);
  p.sensorConnected();
  now += 60_000;
  for(let i=0;i<25;i++) p.accept({t:'ble',ts:now+100,id:'new-'+i,rssi:-60});
  now += 60_000;
  p.tick();
  assert.equal(p.pending.length,1);
  p.revokeConsent();
  assert.equal(p.pending.length,0);
});
test('socket relay forwards exact data while parsing minimized local BLE events', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'pulsemesh-m01-'));
  const palantiny = path.join(dir,'upstream.sock'), listener = path.join(dir,'bridge.sock');
  const bytes = [], events = [], sockets = [];
  const upstream = net.createServer(s => { sockets.push(s);s.on('data', b => bytes.push(b)); });
  await listen(upstream,palantiny);
  const bridge = await startPalantinyBridge({listenPath:listener,palantinySocket:palantiny,onEvent:e=>events.push(e)});
  try {
    assert.equal(fs.statSync(listener).mode & 0o777, 0o600);
    const scanner=await connect(listener);
    const msg='{"t":"ble","ts":123,"id":"private-key","rssi":-60,"name":"Private Person"}\n' +
      '{"t":"wifi","ts":124,"nets":[{"ssid":"Private WiFi"}]}\n';
    scanner.write(msg);
    await new Promise(done=>setTimeout(done,30));
    assert.equal(Buffer.concat(bytes).toString(),msg);
    assert.deepEqual(events,[{t:'ble',ts:123,id:'private-key',rssi:-60}]);
    scanner.destroy();
  } finally {
    await bridge.close();
    sockets.forEach(s=>s.destroy());
    await closeServer(upstream);
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
test('missing upstream fails closed', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pulsemesh-m01-'));
  try {
    await assert.rejects(startPalantinyBridge({listenPath:path.join(dir,'listen.sock'),palantinySocket:path.join(dir,'missing.sock')}),/not found/);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
