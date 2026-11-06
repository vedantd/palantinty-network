import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openLocalIdentity } from '../src/identity.mjs';
import { signReport, verifyEnvelope } from '../src/protocol.mjs';
import { SignedOutbox } from '../src/outbox.mjs';

const now = Date.UTC(2026, 10, 6, 22);
const sample = { complete:true,bucketStart:now-1200_000,bucketSeconds:60,observedAliases:33,
  id:'PRIVATE-ID',name:'Private Name',mfr:'PRIVATE-PAYLOAD',bssid:'private-bssid' };
const policy={consent:true,area:'test-coarse-region'};
function temporary(fn) {
  const dir=mkdtempSync(path.join(tmpdir(),'pulsemesh-m03-'));
  try { return fn(dir); } finally { rmSync(dir,{recursive:true,force:true}); }
}
function ready(dir, clock=()=>now) {
  const identity=openLocalIdentity(path.join(dir,'keys'));
  const queue=new SignedOutbox({dbPath:path.join(dir,'db','outbox.sqlite'),identity,now:clock});
  return {identity,queue};
}

test('signed allowlisted report excludes identifiers and requires opt-in',()=>temporary(dir=>{
  const {queue}=ready(dir);
  assert.equal(queue.enqueue(sample,policy).reason,'opt_in_required');
  queue.setConsent(true);
  const added=queue.enqueue(sample,policy);
  assert.equal(added.ok,true);
  const [{envelope}]=queue.pending();
  assert.equal(verifyEnvelope(envelope).reportId,added.reportId);
  assert.equal(envelope.body.report.activityIndex,30);
  for(const field of ['PRIVATE-ID','Private Name','PRIVATE-PAYLOAD','private-bssid'])
    assert.equal(JSON.stringify(envelope).includes(field),false);
  assert.equal(statSync(path.join(dir,'keys','identity.ed25519.pem')).mode&0o777,0o600);
  assert.equal(statSync(path.join(dir,'db','outbox.sqlite')).mode&0o777,0o600);
  queue.close();
}));

test('tampered signatures and extra device fields fail closed',()=>temporary(dir=>{
  const {queue}=ready(dir);queue.setConsent(true);queue.enqueue(sample,policy);
  const env=queue.pending()[0].envelope;
  assert.throws(()=>verifyEnvelope({...env,body:{...env.body,report:{...env.body.report,activityIndex:500}}}));
  assert.throws(()=>verifyEnvelope({...env,body:{...env.body,report:{...env.body.report,id:'device'}}}));
  assert.throws(()=>verifyEnvelope({...env,body:{...env.body,device:'extra'}}));
  assert.throws(()=>verifyEnvelope({...env,signature:'broken'}));
  queue.close();
}));

test('durable queue preserves identity and monotonic sequences across restart',()=>temporary(dir=>{
  const {identity,queue}=ready(dir);queue.setConsent(true);
  const first=queue.enqueue(sample,policy);queue.close();
  const {identity:again,queue:reopened}=ready(dir);
  assert.equal(again.keyId,identity.keyId);
  assert.equal(reopened.pending()[0].envelope.body.reportId,first.reportId);
  assert.equal(reopened.enqueue({...sample,bucketStart:sample.bucketStart+60_000},policy).sequence,2);
  reopened.close();
}));

test('privacy delay and low counts prohibit queue entry',()=>temporary(dir=>{
  const {queue}=ready(dir);queue.setConsent(true);
  assert.equal(queue.enqueue({...sample,bucketStart:now-60_000},policy).reason,'not_ready');
  assert.equal(queue.enqueue({...sample,observedAliases:2},policy).reason,'below_threshold');
  assert.equal(queue.enqueue(sample,{...policy,consent:false}).reason,'opt_in_required');
  assert.equal(queue.stats().queued,0);
  queue.close();
}));

test('retry backoff, queue capacity, and idempotent acknowledgment',()=>temporary(dir=>{
  let time=now;
  const identity=openLocalIdentity(path.join(dir,'keys'));
  const dbPath=path.join(dir,'db','outbox.sqlite');
  const queue=new SignedOutbox({dbPath,identity,now:()=>time,maxPending:1});
  queue.setConsent(true);
  const first=queue.enqueue(sample,policy);
  assert.equal(queue.enqueue({...sample,bucketStart:sample.bucketStart+60_000},policy).reason,'outbox_full');
  assert.equal(queue.retry(first.reportId),true);
  assert.equal(queue.pending().length,0);
  queue.close();
  const reopened=new SignedOutbox({dbPath,identity,now:()=>time,maxPending:1});
  time+=1000;
  assert.equal(reopened.pending()[0].attempts,1);
  assert.equal(reopened.acknowledge(first.reportId),true);
  assert.equal(reopened.acknowledge(first.reportId),false);
  assert.deepEqual(reopened.stats(),{enabled:true,queued:0,acknowledged:1});
  reopened.close();
}));

test('revocation clears outstanding queue and survives restart',()=>temporary(dir=>{
  const {queue}=ready(dir);queue.setConsent(true);queue.enqueue(sample,policy);
  queue.setConsent(false);
  assert.equal(queue.pending().length,0);
  assert.equal(queue.stats().queued,0);
  queue.close();
  const reopened=ready(dir).queue;
  assert.equal(reopened.enabled,false);
  reopened.close();
}));

test('signed payload rejects all extra report attributes',()=>temporary(dir=>{
  const identity=openLocalIdentity(path.join(dir,'keys'));
  const report={schema:'pulsemesh.activity.v1',area:'region-1',bucketStart:now-1200_000,
    bucketSeconds:60,activityIndex:30,metric:'ble_alias_activity'};
  const env=signReport(report,identity,1);
  assert.equal(verifyEnvelope(env).sequence,1);
  assert.throws(()=>signReport({...report,uuid:'private'},identity,2));
  assert.throws(()=>signReport(report,identity,0));
}));
