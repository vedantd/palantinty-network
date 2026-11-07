import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {
 syntheticRegionKey,parseSyntheticRegionKey,syntheticCoverageRegions,
 syntheticRegionRoutingDigest
} from '../src/private-synthetic-region.mjs';
import {signPrivateCoverage,verifyPrivateCoverage}
 from '../src/private-coverage-advert.mjs';

test('fictional region identifiers are deterministic, bounded and roundtrip',()=>{
 for(const scenario of ['demoarea','simregion','test2026']){
  for(const cellIndex of [0,1,9,10,35,36,63]){
   const key=syntheticRegionKey({scenario,cellIndex});
   assert.deepEqual(parseSyntheticRegionKey(key),{scenario,cellIndex});
   assert.equal(syntheticRegionKey(parseSyntheticRegionKey(key)),key);
  }
 }
 assert.equal(syntheticRegionKey({scenario:'demoarea',cellIndex:0}),'syn:demoarea-c00');
 assert.equal(syntheticRegionKey({scenario:'demoarea',cellIndex:63}),'syn:demoarea-c1r');
});

test('reject coordinates, real-location labels, unbounded cells and noncanonical IDs',()=>{
 for(const bad of [
  'us:nyc','syn:fictional-a','syn:demoarea-c0','syn:demoarea-c1s',
  'syn:demoarea-c01/../','syn:demoarea-c01?latitude=42',
  'syn:demoarea-c01\n','syn:Demoarea-c01','syn:demo-area-c01',
  'syn:demoarea-c001','syn:42.3701,-71.02','syn:demoarea-czz'
 ])assert.throws(()=>parseSyntheticRegionKey(bad));
 for(const obj of [
  {scenario:'ny',cellIndex:1},
  {scenario:'demo-area',cellIndex:1},
  {scenario:'demoarea',cellIndex:-1},
  {scenario:'demoarea',cellIndex:64},
  {scenario:'demoarea',cellIndex:1.5},
  {scenario:'demoarea',cellIndex:NaN},
  {scenario:'demoarea',cellIndex:'1'},
  {scenario:'demoarea',cellIndex:1,latitude:42}
 ]){
  assert.throws(()=>syntheticRegionKey(obj));
 }
});

test('coverage list is sorted, bounded and works with offline signed D01 adverts',()=>{
 const regions=syntheticCoverageRegions({
  scenario:'demoarea',cellIndices:[63,1,0,10]
 });
 assert.deepEqual(regions,[
  'syn:demoarea-c00','syn:demoarea-c01',
  'syn:demoarea-c0a','syn:demoarea-c1r'
 ]);
 assert.equal(Object.isFrozen(regions),true);
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const peerId='12D3KooWQ8U9p7R6T5S4M3N2L1K0J9H8G7F6E5D4C3B2A1';
 const now=1800000000000;
 const advert=signPrivateCoverage({
  version:1,peerId,regions,issuedAt:now-1_000,expiresAt:now+30_000
 },privateKey,now);
 const anchors=new Map([[peerId,publicKey]]);
 for(const region of regions)
  assert.equal(verifyPrivateCoverage(advert,anchors,region,now),true);
 assert.equal(verifyPrivateCoverage(advert,anchors,'syn:demoarea-c02',now),false);
 for(const bad of [
  [],[1,1],Array.from({length:17},(_,i)=>i),[1,64],[1,-1]
 ])assert.throws(()=>syntheticCoverageRegions({scenario:'demoarea',cellIndices:bad}));
});

test('routing digest is stable and domain-separated, but not a DHT provider record',()=>{
 const key=syntheticRegionKey({scenario:'demoarea',cellIndex:1});
 const first=syntheticRegionRoutingDigest(key);
 const second=syntheticRegionRoutingDigest(key);
 const expected=createHash('sha256')
  .update('palantiny.synthetic-region-lookup.v1\0','utf8')
  .update(key,'utf8').digest();
 assert.equal(first.length,32);
 assert.deepEqual(first,expected);
 assert.deepEqual(first,second);
 assert.notDeepEqual(first,syntheticRegionRoutingDigest('syn:demoarea-c02'));
 assert.notDeepEqual(first,syntheticRegionRoutingDigest('syn:otherarea-c01'));
 assert.notDeepEqual(first,createHash('sha256').update(key).digest());
 assert.throws(()=>syntheticRegionRoutingDigest('syn:fictional-a'));
});
