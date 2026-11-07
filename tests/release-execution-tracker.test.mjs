import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateReleaseExecutionTracker,checkReleaseExecutionFiles} from '../src/release-execution-tracker.mjs';

const tracker=JSON.parse(readFileSync('config/release-execution-tracker.json','utf8'));
const gates=JSON.parse(readFileSync('config/public-release-gates.json','utf8'));
const clone=x=>structuredClone(x);
const get=(o,id)=>o.slices.find(s=>s.id===id);

test('every public release slice has a valid dependency, statuses and evidence mapping',()=>{
 const result=checkReleaseExecutionFiles();
 assert.equal(result.slices,28);
 assert.equal(result.launchReady,false);
 assert.ok(result.partial>0);
 assert.ok(result.blockedExternal>0);
});
test('cannot claim public synthetic or real-data release when gates remain blocked',()=>{
 for(const id of ['R-SYN','R-REAL']){
  const c=clone(tracker);get(c,id).status='done';
  get(c,id).evidence=['https://github.com/vedantd/palantinty-network/pull/64'];
  assert.throws(()=>validateReleaseExecutionTracker(c,gates),/Cannot mark/);
 }
});
test('release milestones must enumerate every official independent evidence gate',()=>{
 for(const id of ['R-SYN','R-REAL']){
  const c=clone(tracker);get(c,id).gateIds.pop();
  assert.throws(()=>validateReleaseExecutionTracker(c,gates),/gate coverage/);
 }
});
test('unknown dependency, missing slice and cyclic dependencies are rejected',()=>{
 const c=clone(tracker);get(c,'H01a').dependsOn=['unknown'];
 assert.throws(()=>validateReleaseExecutionTracker(c,gates),/Unknown/);
 const d=clone(tracker);get(d,'H01a').dependsOn=['H01b'];
 assert.throws(()=>validateReleaseExecutionTracker(d,gates),/cycle/);
 const e=clone(tracker);get(e,'H01a').dependsOn=['H01a'];
 assert.throws(()=>validateReleaseExecutionTracker(e,gates),/Self-dependent|cycle/);
 const g=clone(tracker);g.slices=g.slices.filter(s=>s.id!=='R-REAL');
 assert.throws(()=>validateReleaseExecutionTracker(g,gates),/milestone missing/);
});
test('reject completed slice without a linked merged-PR evidence URL',()=>{
 const c=clone(tracker);get(c,'H00').evidence=[];
 assert.throws(()=>validateReleaseExecutionTracker(c,gates),/Invalid/);
});
