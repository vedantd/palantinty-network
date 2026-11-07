import test from 'node:test';
import assert from 'node:assert/strict';
import {syntheticRegionKey,syntheticRegionRoutingDigest}
 from '../src/private-synthetic-region.mjs';
import {syntheticRegionProviderCid,announcePrivateRegion,
 discoverPrivateRegionIndexers,registerPrivateRegionCoverage}
 from '../src/private-region-discovery.mjs';
const region=syntheticRegionKey({scenario:'demoregion',cellIndex:1});
test('region CID is stable raw CIDv1 with canonical SHA-256 of fictional cell',()=>{
 const a=syntheticRegionProviderCid(region);
 const b=syntheticRegionProviderCid(region);
 assert.equal(a.version,1);
 assert.equal(a.code,0x55);
 assert.equal(a.multihash.code,0x12);
 assert.deepEqual(a.multihash.digest,syntheticRegionRoutingDigest(region));
 assert.equal(a.toString(),b.toString());
 assert.notEqual(a.toString(),syntheticRegionProviderCid('syn:demoregion-c02').toString());
 for(const wrong of ['syn:fictional-a','us:nyc','syn:demoregion-c01x'])
  assert.throws(()=>syntheticRegionProviderCid(wrong));
});
test('private node boundary refuses missing DHT service or public address',async()=>{
 const noop=async()=>{};
 const cidOps={provide:noop,findProviders:async function*(){}};
 const node=(addr)=>({services:{dht:{}},contentRouting:cidOps,
  getMultiaddrs:()=>[{toString:()=>addr}]});
 await assert.rejects(announcePrivateRegion(node('/ip4/0.0.0.0/tcp/4001'),region),
  /limited to 127/);
 await assert.rejects(announcePrivateRegion(node('/ip4/10.0.0.1/tcp/4001'),region),
  /limited to 127/);
 await assert.rejects(announcePrivateRegion({services:{},contentRouting:cidOps,
  getMultiaddrs:()=>[]},region),/private Kademlia/);
 assert.throws(()=>registerPrivateRegionCoverage(node('/ip4/0.0.0.0/tcp/4001')),
  /limited to 127/);
});
test('approved peer set and minimum independent providers fail closed',async()=>{
 const mocked={services:{dht:{}},getMultiaddrs:()=>[{
  toString:()=>'/ip4/127.0.0.1/tcp/4444'
 }],contentRouting:{provide:async()=>{},findProviders:async function*(){} }};
 await assert.rejects(discoverPrivateRegionIndexers(mocked,{
  region,approvedIndexerPeerIds:new Set(['one']),minIndexers:2
 }),/Bounded approved/);
 await assert.rejects(discoverPrivateRegionIndexers(mocked,{
  region,approvedIndexerPeerIds:new Set(['one','two']),minIndexers:2
 }),/Only 0\/2/);
 await assert.rejects(discoverPrivateRegionIndexers(mocked,{
  region:'syn:fictional-a',approvedIndexerPeerIds:new Set(['one','two'])
 }),/Invalid synthetic/);
 await assert.rejects(announcePrivateRegion(mocked,region,{timeoutMs:100}),
  /timeout/);
});
