import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {openLocalIdentity} from '../src/identity.mjs';
import {signReport} from '../src/protocol.mjs';
import {SignedOutbox} from '../src/outbox.mjs';
import {DurableRegionalIngest} from '../src/durable-ingest.mjs';
import {replaySignedHistory} from '../src/history-replay.mjs';

const now=Date.UTC(2026,10,6,20), area='synthetic-m09-test';
const window=n=>({complete:true,bucketStart:now-(21-n)*60_000,
 bucketSeconds:60,observedAliases:20+n*5});
const report=n=>({schema:'pulsemesh.activity.v1',area,
 bucketStart:window(n).bucketStart,bucketSeconds:60,
 activityIndex:20+n*5,metric:'ble_alias_activity'});
function temp(fn){
 const dir=mkdtempSync(path.join(tmpdir(),'palantiny-m09-test-'));
 try{
  const identity=openLocalIdentity(path.join(dir,'id'));
  return fn({dir,identity});
 }finally{rmSync(dir,{recursive:true,force:true});}
}
test('out-of-order missed sequence can be filled without lowering watermark',()=>temp(({dir,identity})=>{
 const options={dbPath:path.join(dir,'db','index.sqlite'),
  authorizedKeys:new Set([identity.keyId]),now:()=>now,maxBackfillGap:2};
 let index=new DurableRegionalIngest(options);
 assert.equal(index.ingest(signReport(report(1),identity,1)).accepted,true);
 assert.equal(index.ingest(signReport(report(3),identity,3)).accepted,true);
 assert.equal(index.ingest(signReport(report(2),identity,2)).accepted,true);
 assert.equal(index.stats().accepted,3);
 assert.equal(index.ingest(signReport(report(2),identity,2)).duplicate,true);
 const forged=signReport({...report(2),activityIndex:80},identity,2);
 assert.equal(index.ingest(forged).code,'stale_sequence');
 index.close();
 index=new DurableRegionalIngest(options);
 assert.equal(index.db.prepare('SELECT highest_sequence AS v FROM contributor_sequences WHERE key_id=?')
  .get(identity.keyId).v,3);
 assert.equal(index.ingest(signReport(report(2),identity,2)).duplicate,true);
 index.close();
}));
test('bounded backfill rejects excessively old unseen sequences',()=>temp(({dir,identity})=>{
 const index=new DurableRegionalIngest({dbPath:path.join(dir,'db','index.sqlite'),
  authorizedKeys:new Set([identity.keyId]),now:()=>now,maxBackfillGap:1});
 assert.equal(index.ingest(signReport(report(3),identity,10)).accepted,true);
 assert.equal(index.ingest(signReport(report(1),identity,8)).code,'stale_sequence');
 assert.equal(index.ingest(signReport(report(2),identity,9)).accepted,true);
 assert.equal(index.db.prepare('SELECT highest_sequence AS v FROM contributor_sequences WHERE key_id=?')
  .get(identity.keyId).v,10);
 index.close();
}));
test('archived signed reports survive ACK and restart but honor revocation',()=>temp(({dir,identity})=>{
 const options={dbPath:path.join(dir,'outbox','records.sqlite'),identity,now:()=>now};
 let queue=new SignedOutbox(options);
 queue.setConsent(true);
 const first=queue.enqueue(window(1),{consent:true,area});
 const second=queue.enqueue(window(2),{consent:true,area});
 assert.equal(first.ok,true);assert.equal(second.ok,true);
 assert.equal(queue.acknowledge(first.reportId),true);
 queue.close();
 queue=new SignedOutbox(options);
 assert.deepEqual(queue.signedHistory({area}).map(x=>x.body.sequence),[1,2]);
 assert.deepEqual(queue.signedHistory({area,afterSequence:1,limit:1}).map(x=>x.body.sequence),[2]);
 assert.deepEqual(queue.signedHistory({area:'other-region'}),[]);
 assert.throws(()=>queue.signedHistory({area,limit:0}));
 assert.throws(()=>queue.signedHistory({area,limit:501}));
 queue.setConsent(false);
 assert.deepEqual(queue.signedHistory({area}),[]);
 queue.close();
}));
test('replay refuses untrusted remote target and unbounded requests',async()=>{
 const outbox={signedHistory:()=>[]};
 await assert.rejects(()=>replaySignedHistory({node:{},outbox,area,
  peerAddress:'/ip4/8.8.8.8/tcp/1234/p2p/bad'}),/loopback/);
 await assert.rejects(()=>replaySignedHistory({node:{},outbox,area,maxReports:0}),RangeError);
});
