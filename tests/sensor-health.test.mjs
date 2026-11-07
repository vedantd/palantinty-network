import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalActivityPipeline} from '../src/activity-pipeline.mjs';
const W=60_000,BASE=1_800_000;
const event=(ts,id)=>({t:'ble',ts,id,rssi:-65});

test('sensor diagnostics count accepted and rejected events without identifiers',()=>{
 let now=BASE+1;
 const pipeline=new LocalActivityPipeline({clock:()=>now,windowMs:W});
 pipeline.sensorConnected();
 now=BASE+W+100;
 assert.equal(pipeline.accept(event(now,'secret-alias')),true);
 assert.equal(pipeline.accept(event(now+6000,'future')),false);
 assert.equal(pipeline.accept({t:'wifi',ts:now,id:'wifi-secret'}),false);
 assert.equal(pipeline.accept(event(BASE,'stale')),false);
 pipeline.sensorDisconnected();
 assert.equal(pipeline.accept(event(now,'disconnected')),false);
 pipeline.sensorDisconnected();
 const diagnostics=pipeline.diagnostics();
 assert.equal(diagnostics.connections,1);
 assert.equal(diagnostics.disconnections,1);
 assert.equal(diagnostics.acceptedEvents,1);
 assert.equal(diagnostics.rejectedEvents,4);
 assert.equal(diagnostics.connected,false);
 assert.equal(diagnostics.retiredWindowsDropped,0);
 assert.equal(JSON.stringify(diagnostics).includes('secret-alias'),false);
 assert.equal(Object.isFrozen(diagnostics),true);
});
test('reconnect rejects duplicate connect and never counts partial first bucket',()=>{
 let now=BASE+1;
 const pipeline=new LocalActivityPipeline({clock:()=>now,windowMs:W});
 pipeline.sensorConnected();
 assert.throws(()=>pipeline.sensorConnected(),/already connected/);
 pipeline.sensorDisconnected();
 now=BASE+W+1;
 pipeline.sensorConnected();
 assert.equal(pipeline.accept(event(now,'partial')),false);
 now=BASE+2*W+1;
 assert.equal(pipeline.accept(event(now,'complete')),true);
 const d=pipeline.diagnostics();
 assert.equal(d.connections,2);
 assert.equal(d.disconnections,1);
 assert.equal(d.acceptedEvents,1);
 assert.equal(d.rejectedEvents,1);
});
test('aggregator closed-buffer drops are observable without retaining identifiers',()=>{
 let now=BASE+1;
 const pipeline=new LocalActivityPipeline({clock:()=>now,windowMs:W});
 pipeline.sensorConnected();
 for(let i=1;i<=190;i++){
  now=BASE+(i+1)*W+1;
  assert.equal(pipeline.accept(event(BASE+i*W+10,'id-'+i)),true);
 }
 const d=pipeline.diagnostics();
 assert.ok(d.retiredWindowsDropped>0);
 assert.equal(d.acceptedEvents,190);
 assert.equal(JSON.stringify(d).includes('id-190'),false);
});
