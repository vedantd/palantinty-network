import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { openLocalIdentity } from '../src/identity.mjs';
import { signReport } from '../src/protocol.mjs';
import { RegionalIngest } from '../src/regional-ingest.mjs';

const now=Date.UTC(2026,10,6,20,0,0);
const report=(area='demo-region',index=25,bucket=now-20*60_000)=>({
  schema:'pulsemesh.activity.v1',area,bucketStart:bucket,
  bucketSeconds:60,activityIndex:index,metric:'ble_alias_activity'
});
function fixture(fn) {
  const dir=mkdtempSync(path.join(tmpdir(),'pulsemesh-m04-test-'));
  try {
    const a=openLocalIdentity(path.join(dir,'a'));
    const b=openLocalIdentity(path.join(dir,'b'));
    const outsider=openLocalIdentity(path.join(dir,'outsider'));
    const ingest=new RegionalIngest({authorizedKeys:new Set([a.keyId,b.keyId]),now:()=>now});
    fn({a,b,outsider,ingest});
  }finally{rmSync(dir,{recursive:true,force:true});}
}

test('regional release requires two independent authorized signers',()=>fixture(({a,b,ingest})=>{
  const a1=ingest.ingest(signReport(report(),a,1));
  assert.equal(a1.accepted,true);
  assert.deepEqual(ingest.released(),[]);
  assert.equal(ingest.ingest(signReport(report('demo-region',35),b,1)).accepted,true);
  const released=ingest.released();
  assert.equal(released.length,1);
  assert.equal(released[0].sources,2);
  assert.equal(released[0].relativeBleActivity,30);
  assert.equal(JSON.stringify(released).includes(a.keyId),false);
}));

test('duplicate report gets idempotent ack; replay of stale distinct report fails',()=>fixture(({a,b,ingest})=>{
  const original=signReport(report(),a,1);
  assert.equal(ingest.ingest(original).accepted,true);
  const again=ingest.ingest(original);
  assert.equal(again.accepted,false);
  assert.equal(again.ack,true);
  assert.equal(again.duplicate,true);
  const stale=ingest.ingest(signReport(report('demo-region',40),a,1));
  assert.equal(stale.code,'stale_sequence');
  assert.equal(ingest.stats().accepted,1);
  assert.equal(ingest.ingest(signReport(report('demo-region',50),b,1)).accepted,true);
}));

test('unknown signing key, tampered data, and extra fields are rejected',()=>fixture(({a,outsider,ingest})=>{
  assert.equal(ingest.ingest(signReport(report(),outsider,1)).code,'unauthorized_signer');
  const signed=signReport(report(),a,1);
  const tampered=JSON.parse(JSON.stringify(signed));
  tampered.body.report.activityIndex=100;
  assert.equal(ingest.ingest(tampered).code,'invalid_signature_or_schema');
  const leak=JSON.parse(JSON.stringify(signed));
  leak.body.report.deviceId='PRIVATE';
  assert.equal(ingest.ingest(leak).code,'invalid_signature_or_schema');
  assert.equal(ingest.stats().accepted,0);
}));

test('young/future/expired time buckets cannot be ingested',()=>fixture(({a,ingest})=>{
  assert.equal(ingest.ingest(signReport(report('demo-region',25,now-10_000),a,1)).code,
    'outside_ingest_window');
  assert.equal(ingest.ingest(signReport(report('demo-region',25,now-4*24*60*60_000),a,2)).code,
    'outside_ingest_window');
  assert.equal(ingest.stats().accepted,0);
}));

test('region/time buckets do not combine across incompatible windows',()=>fixture(({a,b,ingest})=>{
  ingest.ingest(signReport(report('demo-region',25),a,1));
  ingest.ingest(signReport(report('another-region',35),b,1));
  assert.deepEqual(ingest.released(),[]);
  assert.equal(ingest.stats().accepted,2);
}));

test('invalid constructor parameters are rejected',()=>{
  assert.throws(()=>new RegionalIngest({authorizedKeys:new Set()}));
  assert.throws(()=>new RegionalIngest({authorizedKeys:new Set(['key']),minOperators:1}));
});
