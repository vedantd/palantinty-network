import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeLocalMeasurementQuality} from '../src/measurement-quality.mjs';
import {LocalActivityPipeline} from '../src/activity-pipeline.mjs';
const base={released:0,incompleteWindows:0,overflowDropped:0,
 retiredWindowsDropped:0,policyRejected:0,revokedPending:0,
 acceptedEvents:0,rejectedEvents:0,pending:0,connections:0,
 disconnections:0,connected:false};
test('silent sensor is insufficient evidence, never 100 percent uptime',()=>{
 const q=summarizeLocalMeasurementQuality(base);
 assert.equal(q.status,'insufficient_evidence');
 assert.equal(q.uptimePct,null);
 assert.equal(q.wallClockCoveragePct,null);
 assert.equal(q.observedWindowLossPct,null);
 assert.equal(q.eventAcceptancePct,null);
 assert.equal(Object.isFrozen(q),true);
});
test('known dropped and incomplete windows degrade quality without leaking aliases',()=>{
 const q=summarizeLocalMeasurementQuality({...base,released:4,
  incompleteWindows:2,overflowDropped:1,retiredWindowsDropped:1,
  pending:2,acceptedEvents:30,rejectedEvents:10,connected:true});
 assert.equal(q.status,'degraded');
 assert.equal(q.observedWindows,10);
 assert.equal(q.lostWindows,4);
 assert.equal(q.observedWindowLossPct,40);
 assert.equal(q.eventAcceptancePct,75);
 assert.equal(q.uptimePct,null);
 assert.equal(JSON.stringify(q).includes('alias'),false);
});
test('policy rejections and consent revocations are accounted for but not called sensor loss',()=>{
 const q=summarizeLocalMeasurementQuality({...base,
  policyRejected:2,revokedPending:1,released:3});
 assert.equal(q.observedWindows,6);
 assert.equal(q.lostWindows,0);
 assert.equal(q.status,'no_known_window_loss');
});
test('pending observations do not imply release or successful coverage',()=>{
 const q=summarizeLocalMeasurementQuality({...base,pending:2});
 assert.equal(q.status,'pending');
 assert.equal(q.observedWindows,2);
 assert.equal(q.lostWindows,0);
});
test('reject malformed or negative counters',()=>{
 assert.throws(()=>summarizeLocalMeasurementQuality(null),TypeError);
 assert.throws(()=>summarizeLocalMeasurementQuality({...base,acceptedEvents:-1}),TypeError);
 assert.throws(()=>summarizeLocalMeasurementQuality({...base,connected:'yes'}),TypeError);
});
test('pipeline exposes quality without publishing any additional signed fields',()=>{
 let now=1_800_001;
 const p=new LocalActivityPipeline({clock:()=>now,
  policy:{consent:false,area:'test-region'}});
 assert.equal(p.measurementQuality().status,'insufficient_evidence');
 p.sensorConnected();
 now=1_860_001;
 p.accept({t:'ble',ts:now,id:'private-ble-alias',rssi:-60});
 now=1_920_001;
 p.tick();
 const q=p.measurementQuality();
 assert.equal(q.status,'no_known_window_loss');
 assert.equal(q.observedWindows,1);
 assert.equal(q.uptimePct,null);
 assert.equal(JSON.stringify(q).includes('private-ble-alias'),false);
});
