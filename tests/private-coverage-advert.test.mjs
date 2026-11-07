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

test('approved PEM public trust anchor works without introducing private signing keys',()=>{
 const ad=signPrivateCoverage(payload(),privateKey,now);
 const pem=publicKey.export({type:'spki',format:'pem'});
 assert.equal(verifyPrivateCoverage(ad,new Map([[peerId,pem]]),'syn:fictional-a',now),true);
 assert.equal(verifyPrivateCoverage(ad,new Map([[peerId,privateKey]]),'syn:fictional-a',now),false);
 assert.equal(verifyPrivateCoverage(ad,new Map([[peerId,privateKey.export({type:'pkcs8',format:'pem'})]]),'syn:fictional-a',now),false);
});
test('reject wrong algorithms, malicious trust stores, and substituted public keys',()=>{
 const ad=signPrivateCoverage(payload(),privateKey,now);
 const other=generateKeyPairSync('ed25519').publicKey;
 const ec=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).publicKey;
 assert.equal(verifyPrivateCoverage(ad,new Map([[peerId,other]]),'syn:fictional-a',now),false);
 assert.equal(verifyPrivateCoverage(ad,new Map([[peerId,ec]]),'syn:fictional-a',now),false);
 assert.equal(verifyPrivateCoverage(ad,{},'syn:fictional-a',now),false);
 assert.equal(verifyPrivateCoverage(ad,new Map(),'syn:fictional-a',now),false);
});
test('advertisement TTL boundary and revoked/expired coverage fail closed',()=>{
 const ad=signPrivateCoverage(payload(),privateKey,now);
 assert.equal(verifyPrivateCoverage(ad,anchors,'syn:fictional-a',now+59999),true);
 assert.equal(verifyPrivateCoverage(ad,anchors,'syn:fictional-a',now+60000),false);
 const removed=new Map(anchors);removed.delete(peerId);
 assert.equal(verifyPrivateCoverage(ad,removed,'syn:fictional-a',now),false);
});
