import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {openLocalIdentity} from '../src/identity.mjs';
import {signReport} from '../src/protocol.mjs';
import {createGossipNode} from '../src/gossip-network.mjs';
import {syntheticTopic,syntheticPacket,encodeSyntheticPacket,decodeSyntheticPacket,
 createSyntheticRateLimiter,observeSyntheticTopic,publishSynthetic} from '../src/synthetic-testnet.mjs';

const area='synthetic-protocol-test',now=Date.UTC(2026,10,6,20);
async function fixture(fn){
 const dir=mkdtempSync(path.join(tmpdir(),'palantiny-p02-'));
 try{
  const identity=openLocalIdentity(path.join(dir,'id'));
  const envelope=signReport({
   schema:'pulsemesh.activity.v1',area,bucketStart:now-20*60_000,
   bucketSeconds:60,activityIndex:25,metric:'ble_alias_activity'
  },identity,1);
  return await fn(envelope);
 }finally{rmSync(dir,{recursive:true,force:true});}
}
test('synthetic testnet has an isolated namespace and sanitized event representation',()=>fixture(env=>{
 const bytes=encodeSyntheticPacket(env);
 assert.equal(syntheticTopic(area),'/palantiny-network/testnet/synthetic/v1/'+area);
 const decoded=decodeSyntheticPacket(bytes,{area});
 assert.equal(decoded.reportId,env.body.reportId);
 assert.equal(decoded.syntheticOnly,true);
 assert.deepEqual(Object.keys(decoded).sort(),
  ['activityIndex','area','bucketStart','reportId','syntheticOnly']);
 assert.equal(JSON.stringify(decoded).includes('signature'),false);
 assert.throws(()=>syntheticTopic('lat/long'));
}));
test('strict packet parser refuses forged, unsynthetic, cross-area and oversized data',()=>fixture(env=>{
 const original=syntheticPacket(env);
 const pack=x=>new TextEncoder().encode(JSON.stringify(x));
 for(const invalid of [
  {...original,syntheticOnly:false},
  {...original,area:'other-region'},
  {...original,rawBleMacs:['a']},
  {...original,envelope:{...env,signature:'forged'}},
 ]){
  assert.throws(()=>decodeSyntheticPacket(pack(invalid),{area}));
 }
 assert.throws(()=>decodeSyntheticPacket(pack(original),{area:'another'}));
 assert.throws(()=>decodeSyntheticPacket(new Uint8Array(8193),{area}));
 assert.throws(()=>decodeSyntheticPacket(Uint8Array.from([255,254]),{area}));
}));
test('bounded per-forwarding-peer limiter rejects floods and limits memory',()=>{
 let clock=1000;
 const limit=createSyntheticRateLimiter({maxPerPeer:2,maxTrackedPeers:2,
  windowMs:100,now:()=>clock});
 assert.equal(limit.allow('p1'),true);
 assert.equal(limit.allow('p1'),true);
 assert.equal(limit.allow('p1'),false);
 assert.equal(limit.allow('p2'),true);
 assert.equal(limit.allow('p3'),false);
 assert.equal(limit.tracked(),2);
 clock=1100;
 assert.equal(limit.allow('p3'),true);
 assert.equal(limit.tracked(),1);
 assert.equal(limit.allow(''),false);
 assert.equal(limit.allow('x'.repeat(129)),false);
});
test('topic observer rejects bad envelopes and never forwards signer archives',()=>fixture(env=>{
 let handler;
 const node={services:{pubsub:{
  addEventListener:(_,fn)=>{handler=fn;},
  removeEventListener:(_,fn)=>{assert.equal(handler,fn);handler=null;},
  subscribe:()=>{},unsubscribe:()=>{}
 }}};
 const observed=[];
 const limiter=createSyntheticRateLimiter({maxPerPeer:3});
 const sub=observeSyntheticTopic(node,{area,limiter,onSynthetic:x=>observed.push(x)});
 handler({detail:{topic:sub.topic,from:{toString:()=> 'p1'},
  data:encodeSyntheticPacket(env)}});
 handler({detail:{topic:sub.topic,from:{toString:()=> 'p1'},
  data:new TextEncoder().encode('{}')}});
 handler({detail:{topic:sub.topic,from:{toString:()=> 'p1'},
  data:new Uint8Array(8193)}});
 handler({detail:{topic:sub.topic,from:{toString:()=> 'p1'},
  data:encodeSyntheticPacket(env)}});
 assert.equal(sub.stats().accepted,1);
 assert.equal(sub.stats().rejected,2);
 assert.equal(sub.stats().limited,1);
 assert.equal(observed.length,1);
 assert.equal(Object.hasOwn(observed[0],'envelope'),false);
 sub.close();sub.close();assert.equal(handler,null);
}));
test('two libp2p peers exchange strictly synthetic-only GossipSub messages',async()=>fixture(async(env)=>{
 const nodes=[];
 let sub;
 try{
  const publisher=await createGossipNode();
  const observer=await createGossipNode();
  nodes.push(publisher,observer);
  const records=[];
  sub=observeSyntheticTopic(observer,{area,onSynthetic:r=>records.push(r)});
  await publisher.peerStore.patch(observer.peerId,{multiaddrs:observer.getMultiaddrs()});
  await publisher.dial(observer.peerId);
  const deadline=Date.now()+10_000;
  while(publisher.services.pubsub.getSubscribers(sub.topic).length===0 &&
        Date.now()<deadline)await sleep(50);
  assert.ok(publisher.services.pubsub.getSubscribers(sub.topic).length>0);
  const sent=await publishSynthetic(publisher,env);
  assert.equal(sent.ack,false);
  while(records.length===0&&Date.now()<deadline)await sleep(50);
  assert.equal(records.length,1);
  assert.equal(records[0].syntheticOnly,true);
 }finally{
  sub?.close();
  await Promise.allSettled(nodes.map(n=>n.stop()));
 }
}));
