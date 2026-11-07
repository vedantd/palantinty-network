import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {openLocalIdentity} from '../src/identity.mjs';
import {signReport} from '../src/protocol.mjs';
import {encodeSyntheticPacket,observeSyntheticTopic,createSyntheticRateLimiter}
 from '../src/synthetic-testnet.mjs';
import {createSyntheticIngressBudget} from '../src/synthetic-ingress-budget.mjs';

test('global quota cannot be bypassed by rotating forwarding peer IDs',()=>{
 let now=1000;
 const quota=createSyntheticIngressBudget({
  maxMessages:3,maxBytes:50,now:()=>now,windowMs:100
 });
 for(const peer of ['a','b','c'])
  assert.equal(quota.allowPacket(new TextEncoder().encode(peer)),true);
 assert.equal(quota.allowPacket(new Uint8Array(1)),false);
 assert.deepEqual(quota.stats(),{messages:3,bytes:3,seenReports:0});
 now=1100;
 assert.equal(quota.allowPacket(new Uint8Array(2)),true);
 assert.deepEqual(quota.stats(),{messages:1,bytes:2,seenReports:0});
});
test('byte quota never overflows and rejects a single huge frame',()=>{
 const quota=createSyntheticIngressBudget({maxMessages:10,maxBytes:8});
 assert.equal(quota.allowPacket(new Uint8Array(9)),false);
 assert.equal(quota.allowPacket(new Uint8Array(6)),true);
 assert.equal(quota.allowPacket(new Uint8Array(3)),false);
 assert.equal(quota.allowPacket(new Uint8Array(2)),true);
 assert.equal(quota.allowPacket(new Uint8Array(1)),false);
 assert.deepEqual(quota.stats(),{messages:2,bytes:8,seenReports:0});
});
test('bounded duplicate report IDs reject replay without unbounded growth',()=>{
 let time=1;
 const budget=createSyntheticIngressBudget({maxSeenReports:2,windowMs:20,now:()=>time});
 const id1='a'.repeat(64),id2='b'.repeat(64),id3='c'.repeat(64);
 assert.equal(budget.firstReport(id1),true);
 assert.equal(budget.firstReport(id1),false);
 assert.equal(budget.firstReport(id2),true);
 assert.equal(budget.firstReport(id3),false);
 assert.equal(budget.stats().seenReports,2);
 time=21;
 assert.equal(budget.firstReport(id3),true);
 assert.equal(budget.stats().seenReports,1);
 assert.equal(budget.firstReport('untrusted'),false);
});
test('global budget refuses unsafe configuration and invalid clocks',()=>{
 for(const opts of [{maxBytes:0},{maxMessages:Infinity},{maxSeenReports:-1},
   {windowMs:0},{maxBytes:1e10},{now:'bad'}])
  assert.throws(()=>createSyntheticIngressBudget(opts));
 const b=createSyntheticIngressBudget({now:()=>NaN});
 assert.throws(()=>b.allowPacket(new Uint8Array(1)));
});
test('observer globally caps rotating peers, rejects duplicates and exposes no envelopes',()=>{
 const root=mkdtempSync(path.join(tmpdir(),'palantiny-p02b2-'));
 let handler=null,observer;
 try{
  const signer=openLocalIdentity(path.join(root,'signer'));
  const report={schema:'pulsemesh.activity.v1',area:'synthetic-budget',
   bucketStart:Date.UTC(2026,10,6,20),bucketSeconds:60,
   activityIndex:25,metric:'ble_alias_activity'};
  const packet=encodeSyntheticPacket(signReport(report,signer,1));
  let now=1;
  const budget=createSyntheticIngressBudget({
   maxMessages:3,maxBytes:30000,maxSeenReports:2,now:()=>now,windowMs:500
  });
  const node={services:{pubsub:{
   addEventListener:(_,fn)=>{handler=fn;},
   removeEventListener:(_,fn)=>{assert.equal(fn,handler);handler=null;},
   subscribe:()=>{},unsubscribe:()=>{}
  }}};
  const events=[];
  observer=observeSyntheticTopic(node,{area:'synthetic-budget',
   budget,limiter:createSyntheticRateLimiter({maxPerPeer:2}),
   onSynthetic:v=>events.push(v)});
  for(let i=0;i<5;i++){
   handler({detail:{topic:observer.topic,from:{toString:()=> 'rotated-'+i},data:packet}});
  }
  const stats=observer.stats();
  assert.equal(stats.accepted,1);
  assert.equal(stats.duplicates,2);
  assert.equal(stats.globalLimited,2);
  assert.equal(events.length,1);
  assert.equal(Object.hasOwn(events[0],'envelope'),false);
  assert.ok(!JSON.stringify(events).includes('signature'));
 }finally{observer?.close();rmSync(root,{recursive:true,force:true});}
});
