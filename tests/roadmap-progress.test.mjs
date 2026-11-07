import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getProgressSnapshot,renderProgressSvg} from '../src/roadmap-progress.mjs';
const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
test('readme progress is generated exactly from the machine-reviewed source of truth',()=>{
 const tracker=read('config/release-execution-tracker.json');
 const gates=read('config/public-release-gates.json');
 const snapshot=getProgressSnapshot(tracker,gates);
 assert.equal(Object.values(snapshot.counts).reduce((a,b)=>a+b,0),snapshot.count);
 assert.equal(snapshot.states.length,snapshot.count);
 const asset=readFileSync(new URL('../assets/roadmap-progress.svg',import.meta.url),'utf8');
 assert.equal(asset,renderProgressSvg(tracker,gates));
 assert.match(asset,/not an ETA/);
 assert.match(asset,/A green CI run does not clear public-release gates/);
});
test('status renderer refuses unrecognized slice or release gate state',()=>{
 const t=read('config/release-execution-tracker.json'),g=read('config/public-release-gates.json');
 assert.throws(()=>getProgressSnapshot({...t,slices:[{id:'BAD',status:'fake'}]},g),/Unknown roadmap status/);
 const bad=structuredClone(g);bad.profiles['open-synthetic-testnet'].gates[0].status='unknown';
 assert.throws(()=>getProgressSnapshot(t,bad),/Unknown release gate status/);
});
