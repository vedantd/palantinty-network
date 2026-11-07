import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalActivityPipeline } from '../src/activity-pipeline.mjs';

const WINDOW=60_000;
const BASE=1_800_000;
const event=(ts,id)=>({t:'ble',ts,id,rssi:-60});
const policy={consent:true,area:'test-region',delayMs:0,minAliases:20};

test('overflow is observable and oldest pending windows are discarded',()=>{
 let now=BASE+10;
 const p=new LocalActivityPipeline({windowMs:WINDOW,clock:()=>now,policy,maxPending:2});
 p.sensorConnected();
 for(let i=1;i<=4;i++){
  now=BASE+(i+1)*WINDOW+1;
  for(let j=0;j<20;j++)
   assert.equal(p.accept(event(BASE+i*WINDOW+10,'alias-'+i+'-'+j)),true);
 }
 // All four complete windows are pending; only two can be retained.
 now=BASE+6*WINDOW;
 const reports=p.tick();
 assert.equal(reports.length,2);
 assert.equal(p.diagnostics().overflowDropped,2);
 assert.equal(p.diagnostics().released,2);
 assert.equal(p.diagnostics().pending,0);
});
test('incomplete windows and consent revocation are accounted for',()=>{
 let now=BASE+1;
 const p=new LocalActivityPipeline({windowMs:WINDOW,clock:()=>now,
  policy:{...policy,delayMs:900_000},maxPending:3});
 p.sensorConnected();
 now=BASE+WINDOW+1;
 p.accept(event(now,'one'));
 p.sensorDisconnected();
 now=BASE+2*WINDOW+1;
 assert.deepEqual(p.tick(),[]);
 assert.equal(p.diagnostics().incompleteWindows,1);
 p.sensorConnected();
 now=BASE+3*WINDOW+1;
 for(let j=0;j<20;j++)p.accept(event(now,'two-'+j));
 now=BASE+4*WINDOW+1;
 p.tick();
 assert.equal(p.diagnostics().pending,1);
 p.revokeConsent();
 assert.equal(p.diagnostics().revokedPending,1);
 assert.equal(p.diagnostics().pending,0);
 assert.equal(p.diagnostics().connected,true);
});
test('diagnostics are snapshots and cannot mutate counters',()=>{
 const p=new LocalActivityPipeline();
 const snapshot=p.diagnostics();
 assert.equal(Object.isFrozen(snapshot),true);
 assert.throws(()=>{snapshot.overflowDropped=999;},TypeError);
 assert.equal(p.diagnostics().overflowDropped,0);
});
