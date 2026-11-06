import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {openLocalIdentity} from '../src/identity.mjs';
import {SignedOutbox} from '../src/outbox.mjs';
import {signReport} from '../src/protocol.mjs';
import {RegionalIngest} from '../src/regional-ingest.mjs';
import {buildPublishableObservation} from '../src/privacy.mjs';

const now=Date.UTC(2026,10,6,22);
const policy={consent:true,area:'test-area'};
const sample={complete:true,bucketStart:now-60_000,bucketSeconds:60,observedAliases:30};
function fixture(fn){
 const dir=mkdtempSync(path.join(tmpdir(),'pulsemesh-hardening-'));
 try{
  const identity=openLocalIdentity(path.join(dir,'identity'));
  const queue=new SignedOutbox({dbPath:path.join(dir,'queue','outbox.sqlite'),identity,now:()=>now});
  try{return fn({queue,identity});}finally{queue.close();}
 }finally{rmSync(dir,{recursive:true,force:true});}
}
test('outbox cannot bypass 15-minute privacy delay using local diagnostic override',()=>fixture(({queue})=>{
 queue.setConsent(true);
 assert.equal(buildPublishableObservation(sample,{...policy,delayMs:0},now).ok,true);
 assert.equal(queue.enqueue(sample,{...policy,delayMs:0}).reason,'not_ready');
 assert.equal(queue.stats().queued,0);
}));
test('outbox refuses duplicate window without consuming sequence',()=>fixture(({queue})=>{
 queue.setConsent(true);
 const old={...sample,bucketStart:now-20*60_000};
 const a=queue.enqueue(old,policy);
 assert.equal(a.sequence,1);
 assert.equal(queue.enqueue(old,policy).reason,'duplicate_window');
 assert.equal(queue.enqueue({...old,bucketStart:old.bucketStart+60_000},policy).sequence,2);
 assert.equal(queue.stats().queued,2);
}));
test('outbox duplicate detection persists across process restarts',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'pulsemesh-duplicate-'));
 try{
  const identity=openLocalIdentity(path.join(dir,'identity'));
  const dbPath=path.join(dir,'queue','outbox.sqlite');
  let queue=new SignedOutbox({dbPath,identity,now:()=>now});
  queue.setConsent(true);
  const old={...sample,bucketStart:now-20*60_000};
  queue.enqueue(old,policy);queue.close();
  queue=new SignedOutbox({dbPath,identity,now:()=>now});
  assert.equal(queue.enqueue(old,policy).reason,'duplicate_window');
  queue.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('in-memory indexer rejects a second report from the same key and window',()=>fixture(({identity})=>{
 const ingest=new RegionalIngest({authorizedKeys:new Set([identity.keyId]),now:()=>now});
 const r={schema:'pulsemesh.activity.v1',area:'test-area',
  bucketStart:now-20*60_000,bucketSeconds:60,activityIndex:30,metric:'ble_alias_activity'};
 assert.equal(ingest.ingest(signReport(r,identity,1)).accepted,true);
 assert.equal(ingest.ingest(signReport({...r,activityIndex:50},identity,2)).code,'already_contributed_to_window');
 assert.equal(ingest.stats().accepted,1);
}));
