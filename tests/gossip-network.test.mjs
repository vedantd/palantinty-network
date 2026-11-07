import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {openLocalIdentity} from '../src/identity.mjs';
import {signReport} from '../src/protocol.mjs';
import {RegionalIngest} from '../src/regional-ingest.mjs';
import {topicForArea,subscribeRegionalAggregates,publishSignedAggregate,createGossipNode}
 from '../src/gossip-network.mjs';

const now=Date.UTC(2026,10,6,20);
const area='synthetic-region-07';
const report=(zone=area)=>({schema:'pulsemesh.activity.v1',area:zone,
 bucketStart:now-20*60_000,bucketSeconds:60,activityIndex:25,metric:'ble_alias_activity'});
function fixture(fn){
 const dir=mkdtempSync(path.join(tmpdir(),'palantiny-gossip-test-'));
 try{return fn(openLocalIdentity(path.join(dir,'key')));}
 finally{rmSync(dir,{recursive:true,force:true});}
}
test('topics reject malformed or precise location claims',()=>{
 assert.equal(topicForArea('abc-123'),'/palantiny-network/aggregate/v1/abc-123');
 for(const name of ['NYC','ab','a/b','/private','x'.repeat(65),'lat:40.2',null])
  assert.throws(()=>topicForArea(name));
});
test('publisher validates allowlisted signed envelope before calling GossipSub',()=>fixture(key=>{
 let calls=0;
 const node={services:{pubsub:{publish:async()=>{calls++;return {recipients:['peer']};}}}};
 const bad=signReport(report(),key,1);
 bad.body.report.activityIndex=500;
 return assert.rejects(publishSignedAggregate(node,bad)).then(()=>assert.equal(calls,0));
}));
test('subscriber rejects invalid signatures, wrong topics, oversized frames and stale replays',()=>fixture(key=>{
 let handler;
 const mock={services:{pubsub:{
  addEventListener:(name,cb)=>{assert.equal(name,'message');handler=cb;},
  removeEventListener:(name,cb)=>{assert.equal(name,'message');assert.equal(cb,handler);handler=null;},
  subscribe:()=>{},unsubscribe:()=>{}
 }}};
 const receiver=new RegionalIngest({authorizedKeys:new Set([key.keyId]),now:()=>now,minOperators:2});
 const outcomes=[];
 const subscription=subscribeRegionalAggregates(mock,{area,ingest:receiver,onOutcome:v=>outcomes.push(v)});
 const enc=x=>new TextEncoder().encode(JSON.stringify(x));
 const signed=signReport(report(),key,1);
 handler({detail:{topic:subscription.topic,data:enc(signed)}});
 assert.equal(subscription.stats().accepted,1);
 handler({detail:{topic:subscription.topic,data:enc(signed)}});
 assert.equal(subscription.stats().duplicate,1);
 const forged=signReport(report(),key,2);
 forged.signature='forged';
 handler({detail:{topic:subscription.topic,data:enc(forged)}});
 const another=signReport(report('other-region'),key,3);
 handler({detail:{topic:subscription.topic,data:enc(another)}});
 handler({detail:{topic:subscription.topic,data:new Uint8Array(16_385)}});
 handler({detail:{topic:'unrelated',data:enc(signed)}});
 assert.equal(subscription.stats().rejected,3);
 assert.equal(receiver.stats().accepted,1);
 assert.equal(outcomes.length,5);
 assert.equal(JSON.stringify(outcomes).includes(key.keyId),false);
 subscription.close();subscription.close();
 assert.equal(handler,null);
}));
test('GossipSub refuses non-loopback listener before loading dependencies',async()=>{
 await assert.rejects(()=>createGossipNode({listen:'/ip4/0.0.0.0/tcp/0'}),/loopback/);
});
