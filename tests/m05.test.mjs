import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { openLocalIdentity } from '../src/identity.mjs';
import { signReport } from '../src/protocol.mjs';
import { DurableRegionalIngest } from '../src/durable-ingest.mjs';

const now=Date.UTC(2026,10,6,20);
const minute=60_000;
const bucket=now-20*minute;
const report=(area='pilot-region',index=25,start=bucket)=>({
  schema:'pulsemesh.activity.v1',area,bucketStart:start,bucketSeconds:60,
  activityIndex:index,metric:'ble_alias_activity'
});
function temp(fn) {
  const dir=mkdtempSync(path.join(tmpdir(),'pulsemesh-m05-unit-'));
  try {
    const a=openLocalIdentity(path.join(dir,'a'));
    const b=openLocalIdentity(path.join(dir,'b'));
    const c=openLocalIdentity(path.join(dir,'c'));
    const dbPath=path.join(dir,'regional','index.sqlite');
    const opts={dbPath,authorizedKeys:new Set([a.keyId,b.keyId]),now:()=>now};
    return fn({a,b,c,opts,dbPath});
  } finally {rmSync(dir,{recursive:true,force:true});}
}
test('committed reports and sequence watermarks survive restart',()=>temp(({a,b,opts,dbPath})=>{
  let index=new DurableRegionalIngest(opts);
  const first=signReport(report(),a,1);
  assert.equal(index.ingest(first).ack,true);
  index.close();
  assert.equal(statSync(dbPath).mode&0o777,0o600);
  index=new DurableRegionalIngest(opts);
  assert.deepEqual(index.stats(),{accepted:1,contributors:1,authorizedKeys:2});
  assert.equal(index.ingest(first).code,'already_accepted');
  assert.equal(index.ingest(first).duplicate,true);
  assert.equal(index.ingest(signReport(report('pilot-region',40),a,1)).code,'stale_sequence');
  assert.equal(index.query({area:'pilot-region'}).length,0);
  assert.equal(index.ingest(signReport(report('pilot-region',35),b,1)).accepted,true);
  assert.deepEqual(index.query({area:'pilot-region'}).map(x=>[x.sources,x.relativeBleActivity]),[[2,30]]);
  index.close();
  index=new DurableRegionalIngest(opts);
  assert.equal(index.query({area:'pilot-region'})[0].relativeBleActivity,30);
  index.close();
}));
test('one signing key cannot count twice in a cell even with new sequence',()=>temp(({a,b,opts})=>{
  const index=new DurableRegionalIngest(opts);
  assert.equal(index.ingest(signReport(report(),a,1)).accepted,true);
  assert.equal(index.ingest(signReport(report('pilot-region',45),a,2)).code,'already_contributed_to_window');
  assert.equal(index.ingest(signReport(report('pilot-region',35),b,1)).accepted,true);
  assert.equal(index.query({area:'pilot-region'})[0].sources,2);
  index.close();
}));
test('unauthorized, stale, immature and tampered reports fail closed',()=>temp(({a,c,opts})=>{
  const index=new DurableRegionalIngest(opts);
  assert.equal(index.ingest(signReport(report(),c,1)).code,'unauthorized_signer');
  assert.equal(index.ingest(signReport(report('pilot-region',25,now-60_000),a,1)).code,'outside_ingest_window');
  const tampered=signReport(report(),a,1);
  tampered.body.report.activityIndex=100;
  assert.equal(index.ingest(tampered).code,'invalid_signature_or_schema');
  assert.equal(index.stats().accepted,0);
  index.close();
}));
test('retention capacity refuses new writes rather than dropping replay history',()=>temp(({a,b,opts})=>{
  const index=new DurableRegionalIngest({...opts,maxStoredReports:1});
  assert.equal(index.ingest(signReport(report(),a,1)).accepted,true);
  assert.equal(index.ingest(signReport(report('pilot-region',35),b,1)).code,'index_full');
  assert.equal(index.ingest(signReport(report(),a,1)).code,'already_accepted');
  index.close();
}));
test('query validates bounds and never reveals per-node values or keys',()=>temp(({a,b,opts})=>{
  const index=new DurableRegionalIngest(opts);
  index.ingest(signReport(report(),a,1));
  index.ingest(signReport(report('pilot-region',35),b,1));
  assert.throws(()=>index.query({area:'pilot-region',limit:501}));
  assert.throws(()=>index.query({area:'other',start:100,end:1}));
  assert.deepEqual(index.query({area:'other'}),[]);
  const rendered=JSON.stringify(index.query({area:'pilot-region'}));
  assert.equal(rendered.includes(a.keyId),false);
  assert.equal(rendered.includes(b.keyId),false);
  assert.equal(rendered.includes('publicKey'),false);
  index.close();
}));
