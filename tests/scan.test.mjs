import test from 'node:test';
import assert from 'node:assert/strict';
import { ScanSession } from '../src/scan-session.mjs';
import { JsonLineDecoder } from '../src/jsonl.mjs';

const START=Date.UTC(2026,10,6,20,0,0);
const ble=(ts,id,rssi=-85)=>JSON.stringify({t:'ble',ts,id,rssi,name:'Private Person',mfr:'4c0012aa'});

test('continuous scan retains four windows, respects delay and emits only aggregates',()=>{
  let now=START+1000;
  const session=new ScanSession({clock:()=>now,windowSeconds:20});
  session.onConnected();
  session.onLine(JSON.stringify({t:'status',ts:now,bluetooth:'on'}));
  session.onLine(ble(START+2000,'partial'));
  for(let bucket=1;bucket<=4;bucket++){
    for(let i=0;i<22+bucket;i++){
      now=START+bucket*20000+1000+i*100;
      session.onLine(ble(now,`secret-${bucket}-${i}`));
    }
    now=START+(bucket+1)*20000;
    session.tick();
  }
  const output=session.summary();
  assert.equal(output.radio,'on');
  assert.equal(output.closedWindows.length,4);
  assert.deepEqual(output.closedWindows.map(x=>x.observedAliases),[23,24,25,26]);
  assert.ok(output.closedWindows.every(x=>x.defaultGate==='not_ready'));
  assert.equal(output.closedWindows[0].activityIndex,20);
  assert.equal(output.rejected,0);
  assert.equal(output.droppedClosedWindows,0);
  const text=JSON.stringify(output);
  for(const sensitive of ['secret-','Private Person','4c0012aa','partial']) assert.equal(text.includes(sensitive),false);
  session.clearSensitiveState();
  assert.equal(session.sessionAliases.size,0);
});

test('fragmented JSONL is parsed locally without exposing identifiers',()=>{
  let now=START+1000;
  const session=new ScanSession({clock:()=>now,windowSeconds:20});
  session.onConnected();
  now=START+21000;
  const parser=new JsonLineDecoder({onLine:line=>session.onLine(line),onDropped:()=>session.onDroppedLine()});
  const message=ble(now,'private-identifier')+'\n';
  parser.push(message.slice(0,12));
  parser.push(message.slice(12));
  assert.equal(session.accepted,1);
  assert.equal(JSON.stringify(session.progress()).includes('private-identifier'),false);
});

test('disconnect invalidates a partially observed active window',()=>{
  let now=START;
  const session=new ScanSession({clock:()=>now,windowSeconds:20});
  session.onConnected();
  now=START+21000;
  session.onLine(ble(now,'private'));
  session.onDisconnected();
  now=START+41000;
  assert.equal(session.summary().complete,false);
  assert.equal(session.summary().closedWindows.length,0);
});

test('future events rejected and incomplete startup bucket excluded',()=>{
  let now=START;
  const session=new ScanSession({clock:()=>now,windowSeconds:20});
  session.onConnected();
  now=START+21000;
  session.onLine(ble(now-80000,'outside-start'));
  session.onLine(ble(now+80000,'future'));
  assert.equal(session.rejected,1);
  assert.equal(session.accepted,0);
});


test('partial Wi-Fi and location status updates preserve explicit Bluetooth state',()=>{
  let now=START;
  const session=new ScanSession({clock:()=>now,windowSeconds:20});
  session.onConnected();
  session.onLine(JSON.stringify({t:'status',ts:now,bluetooth:'on'}));
  assert.equal(session.radio,'on');
  session.onLine(JSON.stringify({t:'status',ts:now+1,wifi:'on',location:'allowed'}));
  session.onLine(JSON.stringify({t:'status',ts:now+2,location:'waiting'}));
  session.onLine(JSON.stringify({t:'wifi',ts:now+3,nets:[{ssid:'private-network',bssid:'aa:bb:cc:dd:ee:ff'}]}));
  assert.equal(session.summary().radio,'on');
  assert.equal(JSON.stringify(session.summary()).includes('private-network'),false);
  session.onLine(JSON.stringify({t:'status',ts:now+4,bluetooth:'off'}));
  assert.equal(session.summary().radio,'off');
  session.onLine(JSON.stringify({t:'status',ts:now+5,wifi:'off'}));
  assert.equal(session.summary().radio,'off');
});
test('unknown Bluetooth state only when explicitly reported',()=>{
  let now=START;
  const session=new ScanSession({clock:()=>now,windowSeconds:20});
  session.onConnected();
  session.onLine(JSON.stringify({t:'status',ts:now,wifi:'on'}));
  assert.equal(session.radio,'unknown');
  session.onLine(JSON.stringify({t:'status',ts:now+1,bluetooth:'on'}));
  session.onLine(JSON.stringify({t:'status',ts:now+2,bluetooth:'broken-unrecognized'}));
  assert.equal(session.radio,'on');
  session.onLine(JSON.stringify({t:'status',ts:now+3,bluetooth:'unknown'}));
  assert.equal(session.radio,'unknown');
});
