import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair} from '@libp2p/crypto/keys';
import {peerIdFromPrivateKey} from '@libp2p/peer-id';
import {
 syntheticAreaForRegion,validateSyntheticRows,
 signPrivateSyntheticReply,verifyPrivateSyntheticReply,
 comparePrivateSyntheticRows,settlePrivateSyntheticQuorum,
 PrivateIndexerUnavailable,queryDiscoveredPrivateRegion,
 registerPrivateSyntheticQuery
} from '../src/private-region-query.mjs';

const NOW=1800000000000;
const REGION='syn:demoregion-c01';
const nonce=Buffer.alloc(16,7).toString('base64url');
const request={schema:'palantiny.private-synthetic-query.request.v1',
 region:REGION,start:NOW-60*60_000,end:NOW-16*60_000,
 limit:4,nonce};
const row={area:'synthetic-demoregion-01',bucketStart:NOW-22*60_000,
 bucketSeconds:60,sources:2,relativeBleActivity:30,
 status:'experimental_synthetic_only'};
const payload=(peerId,rows=[row])=>({
 schema:'palantiny.private-synthetic-query.reply.v1',
 peerId,region:REGION,start:request.start,end:request.end,
 limit:request.limit,nonce,issuedAt:NOW,expiresAt:NOW+30_000,rows
});
const keys=async()=>{
 const a=await generateKeyPair('Ed25519');
 const b=await generateKeyPair('Ed25519');
 return {a,b,aId:peerIdFromPrivateKey(a).toString(),
  bId:peerIdFromPrivateKey(b).toString()};
};
test('D03 fictional region maps to a strict non-geographic aggregate area',()=>{
 assert.equal(syntheticAreaForRegion(REGION),row.area);
 assert.throws(()=>syntheticAreaForRegion('us:nyc'));
 assert.throws(()=>syntheticAreaForRegion('syn:fake-czz'));
});
test('D03 signed thresholded rows bind query nonce and indexer Noise Peer ID',async()=>{
 const f=await keys();
 const reply=await signPrivateSyntheticReply(payload(f.aId),f.a,request,NOW);
 const opts={request,expectedPeerId:f.aId,
  approvedIndexerPeerIds:new Set([f.aId,f.bId]),now:NOW};
 assert.equal(await verifyPrivateSyntheticReply(reply,opts),true);
 assert.equal(await verifyPrivateSyntheticReply(reply,{
  ...opts,approvedIndexerPeerIds:new Set([f.bId])}),false);
 assert.equal(await verifyPrivateSyntheticReply(reply,{
  ...opts,expectedPeerId:f.bId}),false);
 const wrong=await signPrivateSyntheticReply(payload(f.bId),f.b,request,NOW);
 assert.equal(await verifyPrivateSyntheticReply({...reply,publicKey:wrong.publicKey},opts),false);
 assert.equal(await verifyPrivateSyntheticReply({...reply,signature:wrong.signature},opts),false);
 assert.equal(await verifyPrivateSyntheticReply({...reply,payload:{
  ...reply.payload,rows:[{...row,relativeBleActivity:500}]}},opts),false);
 assert.equal(await verifyPrivateSyntheticReply(reply,{
  ...opts,request:{...request,nonce:Buffer.alloc(16,8).toString('base64url')}}),false);
 assert.equal(await verifyPrivateSyntheticReply(reply,{...opts,now:NOW+30_000}),false);
 await assert.rejects(signPrivateSyntheticReply(payload(f.bId),f.a,request,NOW),
  /signer must equal/);
});
test('D03 refuses unauthorized, unthresholded, stale, oversized and leaky rows',()=>{
 assert.deepEqual(validateSyntheticRows([row],request,NOW),[row]);
 const bad=[
  {...row,sources:1}, // single signer cannot be represented as a public aggregate
  {...row,bucketStart:NOW-14*60_000},
  {...row,area:'another-region'},
  {...row,signerKeyId:'exposed'},
  {...row,status:'real_measured'},
  {...row,relativeBleActivity:NaN},
  {...row,relativeBleActivity:-10},
  {...row,bucketSeconds:86400}
 ];
 for(const r of bad)assert.throws(()=>validateSyntheticRows([r],request,NOW));
 assert.throws(()=>validateSyntheticRows(Array(5).fill(row),request,NOW));
 assert.throws(()=>validateSyntheticRows([row,row],request,NOW));
 assert.throws(()=>validateSyntheticRows([row],{...request,end:NOW},NOW));
 assert.throws(()=>validateSyntheticRows([row],{...request,start:NOW-25*60*60_000},NOW));
 assert.throws(()=>validateSyntheticRows([row],{...request,nonce:'1'},NOW));
 assert.throws(()=>validateSyntheticRows([row],{...request,limit:10000},NOW));
});
test('D03 agreement is withheld for two missing or disagreeing archives',()=>{
 const f=[{peerId:'index-a',rows:[row]},{peerId:'index-b',rows:[row]}];
 const ok=comparePrivateSyntheticRows(f,request,NOW);
 assert.equal(ok.status,'consistent');
 assert.deepEqual(ok.rows,[row]);
 const noData=comparePrivateSyntheticRows(f.map(x=>({...x,rows:[]})),request,NOW);
 assert.equal(noData.status,'no-data');
 assert.deepEqual(noData.rows,[]);
 const disagreement=comparePrivateSyntheticRows([
  f[0],{...f[1],rows:[{...row,relativeBleActivity:45}]}
 ],request,NOW);
 assert.equal(disagreement.status,'disagreement');
 assert.deepEqual(disagreement.rows,[]);
 assert.throws(()=>comparePrivateSyntheticRows([f[0]],request,NOW));
 assert.throws(()=>comparePrivateSyntheticRows([
  f[0],{peerId:'index-a',rows:[row]}
 ],request,NOW));
});
test('D03 never dials unvalidated, duplicate or unapproved D02a providers',async()=>{
 let dials=0;
 const node={handle:()=>{},getMultiaddrs:()=>[{
  toString:()=>'/ip4/127.0.0.1/tcp/3000'
 }],getConnections:()=>[],dialProtocol:async()=>{dials++;}};
 const options={region:REGION,approvedIndexerPeerIds:new Set(['a','b']),
  start:NOW-60*60_000,end:NOW-16*60_000,clock:()=>NOW};
 await assert.rejects(queryDiscoveredPrivateRegion(node,{
  ...options,discovery:{region:REGION,results:[{peerId:'a',verified:true,region:REGION,
   expiresAt:NOW+1000}]} }),/two to four D02a/);
 await assert.rejects(queryDiscoveredPrivateRegion(node,{
  ...options,discovery:{region:REGION,results:[
   {peerId:'a',verified:true,region:REGION,expiresAt:NOW+1000},
   {peerId:'a',verified:true,region:REGION,expiresAt:NOW+1000}
  ]}}),/duplicate/);
 assert.equal(dials,0);
});
test('D03 query handler refuses public or nonthresholded private servers',async()=>{
 const f=await keys();
 const mkNode=addr=>({peerId:{toString:()=>f.aId},
  handle:()=>{},getMultiaddrs:()=>[{toString:()=>addr}]});
 const arg={privateKey:f.a,region:REGION,
  ingest:{minOperators:2,query:()=>[]},
  approvedClientPeerIds:new Set(['approved'])};
 assert.throws(()=>registerPrivateSyntheticQuery(mkNode('/ip4/0.0.0.0/tcp/1234'),arg),
  /loopback/);
 assert.throws(()=>registerPrivateSyntheticQuery(mkNode('/ip4/127.0.0.1/tcp/1234'),{
  ...arg,ingest:{minOperators:1,query:()=>[]}
 }),/thresholded/);
});

test('D03b 2-of-3 private replies tolerate one transport outage only',()=>{
 const a={peerId:'index-a',rows:[row]},b={peerId:'index-b',rows:[row]};
 const outage={status:'rejected',reason:new PrivateIndexerUnavailable('offline')};
 const q=settlePrivateSyntheticQuorum([
  {status:'fulfilled',value:a},outage,{status:'fulfilled',value:b}
 ],request,NOW);
 assert.equal(q.status,'consistent');
 assert.equal(q.sources,2);
 assert.equal(q.unavailableCount,1);
 assert.equal(q.degraded,true);
 assert.deepEqual(q.rows,[row]);
 const missing=settlePrivateSyntheticQuorum([
  {status:'fulfilled',value:{...a,rows:[]}},
  outage,
  {status:'fulfilled',value:{...b,rows:[]}}
 ],request,NOW);
 assert.equal(missing.status,'no-data');
 assert.deepEqual(missing.rows,[]);
 assert.throws(()=>settlePrivateSyntheticQuorum([
  {status:'fulfilled',value:a},outage,outage
 ],request,NOW),/insufficient authenticated/);
});
test('D03b checks every responding indexer, not only a convenient matching pair',()=>{
 const r=settlePrivateSyntheticQuorum([
  {status:'fulfilled',value:{peerId:'a',rows:[row]}},
  {status:'fulfilled',value:{peerId:'b',rows:[row]}},
  {status:'fulfilled',value:{peerId:'c',rows:[{...row,relativeBleActivity:55}]}}
 ],request,NOW);
 assert.equal(r.status,'disagreement');
 assert.deepEqual(r.rows,[]);
 assert.equal(r.sources,3);
 assert.equal(r.degraded,false);
 assert.throws(()=>settlePrivateSyntheticQuorum([
  {status:'fulfilled',value:{peerId:'a',rows:[row]}},
  {status:'fulfilled',value:{peerId:'a',rows:[row]}}
 ],request,NOW),/distinct/);
});
test('D03b malformed/stale/auth failures cannot be hidden by two valid peers',()=>{
 const good={status:'fulfilled',value:{peerId:'a',rows:[row]}};
 const goodB={status:'fulfilled',value:{peerId:'b',rows:[row]}};
 for(const rejected of [
  {status:'rejected',reason:Error('invalid signed response')},
  {status:'rejected',reason:Error('stale coverage')},
  {status:'rejected',reason:Error('unapproved peer')}
 ])assert.throws(()=>settlePrivateSyntheticQuorum([
  good,goodB,rejected
 ],request,NOW),/refused invalid/);
 assert.throws(()=>settlePrivateSyntheticQuorum([
  good,goodB,{status:'fulfilled',value:{peerId:'c',rows:[
   {...row,rawMacAddress:'leak'}
  ]}}
 ],request,NOW),/malformed/);
 assert.throws(()=>settlePrivateSyntheticQuorum([
  good,goodB,{status:'fulfilled',value:{peerId:'c',rows:[
   {...row,bucketStart:NOW-3*60_000}
  ]}}
 ],request,NOW),/Unreleased/);
 assert.throws(()=>settlePrivateSyntheticQuorum([good,goodB,good,good,good],
  request,NOW),/bounded/);
});
test('D03b disconnected approved indexers fail closed before any stream',async()=>{
 const f=await keys();
 let dials=0;
 const node={handle:()=>{},getMultiaddrs:()=>[{
  toString:()=>'/ip4/127.0.0.1/tcp/3000'
 }],getConnections:()=>[],dialProtocol:async()=>{dials++;}};
 const opts={region:REGION,start:request.start,end:request.end,
  limit:request.limit,clock:()=>NOW,
  approvedIndexerPeerIds:new Set([f.aId,f.bId]),
  discovery:{region:REGION,results:[f.aId,f.bId].map(peerId=>({
   peerId,region:REGION,verified:true,expiresAt:NOW+30_000
  }))}};
 await assert.rejects(queryDiscoveredPrivateRegion(node,opts),
  /insufficient authenticated/);
 assert.equal(dials,0);
 await assert.rejects(queryDiscoveredPrivateRegion(node,{
  ...opts,discovery:{region:REGION,results:[
   ...opts.discovery.results,{...opts.discovery.results[0]}
  ]}
 }),/duplicate indexer/);
});
