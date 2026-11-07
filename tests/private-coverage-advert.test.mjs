import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { signPrivateCoverage, verifyPrivateCoverage } from '../src/private-coverage-advert.mjs';
const {publicKey,privateKey}=generateKeyPairSync('ed25519');
const peerId='12D3KooWQ8U9p7R6T5S4M3N2L1K0J9H8G7F6E5D4C3B2A1';
const now=1800000000000;
const payload=()=>({version:1,peerId,regions:['syn:fictional-a','syn:fictional-b'],issuedAt:now-1000,expiresAt:now+60000});
const anchors=new Map([[peerId,publicKey]]);
test('approved signed fictional coverage is accepted only for listed cell',()=>{
 const ad=signPrivateCoverage(payload(),privateKey,now);
 assert.equal(verifyPrivateCoverage(ad,anchors,'syn:fictional-a',now),true);
 assert.equal(verifyPrivateCoverage(ad,anchors,'syn:fictional-c',now),false);
 assert.equal(verifyPrivateCoverage(ad,new Map(),'syn:fictional-a',now),false);
});
test('tamper, expiry, unknown fields and invalid signatures fail closed',()=>{
 const ad=signPrivateCoverage(payload(),privateKey,now);
 assert.equal(verifyPrivateCoverage({...ad,payload:{...ad.payload,regions:['syn:fictional-c']}},anchors,'syn:fictional-c',now),false);
 assert.equal(verifyPrivateCoverage(ad,anchors,'syn:fictional-a',now+61000),false);
 assert.equal(verifyPrivateCoverage({...ad,extra:1},anchors,'syn:fictional-a',now),false);
 assert.equal(verifyPrivateCoverage({...ad,signature:'a'},anchors,'syn:fictional-a',now),false);
});
test('signing rejects real geographic cells, duplicate/unsorted regions, future timestamps and excessive TTL',()=>{
 for(const bad of [
  {...payload(),regions:['us:nyc']},
  {...payload(),regions:['syn:fictional-a','syn:fictional-a']},
  {...payload(),regions:['syn:z','syn:a']},
  {...payload(),issuedAt:now+1},
  {...payload(),expiresAt:now+900001},
  {...payload(),location:{lat:1,lon:2}}
 ]) assert.throws(()=>signPrivateCoverage(bad,privateKey,now));
});
