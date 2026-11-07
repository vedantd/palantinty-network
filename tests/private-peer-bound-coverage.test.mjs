import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair} from '@libp2p/crypto/keys';
import {peerIdFromPrivateKey} from '@libp2p/peer-id';
import {syntheticCoverageRegions} from '../src/private-synthetic-region.mjs';
import {signPeerBoundCoverage,verifyPeerBoundCoverage}
 from '../src/private-peer-bound-coverage.mjs';

const NOW=1800000000000;
const coverage=(peerId)=>({
 version:1,peerId,regions:syntheticCoverageRegions({
  scenario:'demoregion',cellIndices:[0,1]
 }),issuedAt:NOW-1_000,expiresAt:NOW+15_000
});
const fixtures=async()=>{
 const a=await generateKeyPair('Ed25519');
 const b=await generateKeyPair('Ed25519');
 const aId=peerIdFromPrivateKey(a).toString();
 const bId=peerIdFromPrivateKey(b).toString();
 return {a,b,aId,bId};
};
test('signed coverage is bound to Noise PeerId and local operator allowlist',async()=>{
 const f=await fixtures();
 const advert=await signPeerBoundCoverage(coverage(f.aId),f.a,NOW);
 const opt={expectedPeerId:f.aId,approvedPeerIds:new Set([f.aId]),
  region:'syn:demoregion-c00',now:NOW};
 assert.equal(await verifyPeerBoundCoverage(advert,opt),true);
 assert.equal(await verifyPeerBoundCoverage(advert,{...opt,region:'syn:demoregion-c01'}),true);
 assert.equal(await verifyPeerBoundCoverage(advert,{...opt,region:'syn:demoregion-c02'}),false);
 assert.equal(await verifyPeerBoundCoverage(advert,{...opt,approvedPeerIds:new Set()}),false);
 assert.equal(await verifyPeerBoundCoverage(advert,{...opt,expectedPeerId:f.bId,
  approvedPeerIds:new Set([f.aId,f.bId])}),false);
 assert.equal(await verifyPeerBoundCoverage(advert,{...opt,now:NOW+15_000}),false);
});
test('cannot claim another libp2p Peer ID with a different signing key',async()=>{
 const f=await fixtures();
 await assert.rejects(signPeerBoundCoverage(coverage(f.bId),f.a,NOW),/does not match/);
 const advert=await signPeerBoundCoverage(coverage(f.aId),f.a,NOW);
 const foreign=await signPeerBoundCoverage(coverage(f.bId),f.b,NOW);
 const opt={expectedPeerId:f.aId,approvedPeerIds:new Set([f.aId,f.bId]),
  region:'syn:demoregion-c00',now:NOW};
 assert.equal(await verifyPeerBoundCoverage({...advert,publicKey:foreign.publicKey},opt),false);
 assert.equal(await verifyPeerBoundCoverage({...advert,signature:foreign.signature},opt),false);
 assert.equal(await verifyPeerBoundCoverage({...advert,payload:{...advert.payload,peerId:f.bId}},opt),false);
 assert.equal(await verifyPeerBoundCoverage({...advert,payload:{...advert.payload,
  regions:['syn:demoregion-c01']}},opt),false);
});
test('reject expired, future, malformed and noncanonical fictional coverage',async()=>{
 const f=await fixtures();
 const good=await signPeerBoundCoverage(coverage(f.aId),f.a,NOW);
 const opt={expectedPeerId:f.aId,approvedPeerIds:new Set([f.aId]),
  region:'syn:demoregion-c00',now:NOW};
 for(const bad of [
  {...good,unexpected:true},
  {...good,signature:'???'},
  {...good,signature:'AAA='+good.signature},
  {...good,signature:good.signature.slice(0,-2)},
  {...good,publicKey:good.publicKey+'\n'},
  {...good,payload:{...good.payload,regions:['syn:fictional-a']}},
  {...good,payload:{...good.payload,regions:['syn:demoregion-c01','syn:demoregion-c00']}},
  {...good,payload:{...good.payload,issuedAt:NOW+1}}
 ])assert.equal(await verifyPeerBoundCoverage(bad,opt),false);
 assert.equal(await verifyPeerBoundCoverage(good,{...opt,region:'syn:fictional-a'}),false);
 assert.equal(await verifyPeerBoundCoverage(good,{...opt,approvedPeerIds:{has:()=>true}}),false);
 await assert.rejects(signPeerBoundCoverage({...coverage(f.aId),
  regions:['syn:fictional-a']},f.a,NOW));
 await assert.rejects(signPeerBoundCoverage({...coverage(f.aId),
  issuedAt:NOW+1},f.a,NOW));
});
