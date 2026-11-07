import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluatePublicReleaseGates} from '../src/release-readiness.mjs';
const ledger=JSON.parse(readFileSync(new URL('../config/public-release-gates.json',import.meta.url),'utf8'));
const copy=()=>structuredClone(ledger);
test('both launch profiles fail closed with explicit remaining gates',()=>{
 for(const profile of ['open-synthetic-testnet','public-real-sensing']){
  const result=evaluatePublicReleaseGates(ledger,profile);
  assert.equal(result.ready,false);
  assert.ok(result.outstanding.length>0);
  assert.equal(result.verified,0);
 }
});
test('unknown profiles, incomplete ledgers and missing evidence fail closed',()=>{
 assert.throws(()=>evaluatePublicReleaseGates(ledger,'public'),/Unknown/);
 const bad=copy();delete bad.profiles['public-real-sensing'];
 assert.throws(()=>evaluatePublicReleaseGates(bad,'open-synthetic-testnet'),/Invalid/);
 const unverifiable=copy();unverifiable.profiles['open-synthetic-testnet'].gates[0].status='verified';
 assert.throws(()=>evaluatePublicReleaseGates(unverifiable,'open-synthetic-testnet'),/requires evidence/);
 const repeat=copy();repeat.profiles['open-synthetic-testnet'].gates[1].id=
  repeat.profiles['open-synthetic-testnet'].gates[0].id;
 assert.throws(()=>evaluatePublicReleaseGates(repeat,'open-synthetic-testnet'),/Invalid/);
});
test('real-sensing release remains blocked when synthetic testnet prerequisite is blocked',()=>{
 const config=copy();
 for(const gate of config.profiles['public-real-sensing'].gates){
  gate.status='verified';gate.evidence=['https://example.org/placeholder-evidence'];
 }
 const result=evaluatePublicReleaseGates(config,'public-real-sensing');
 assert.equal(result.dependencyBlocked,true);
 assert.equal(result.ready,false);
});
