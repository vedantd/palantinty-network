import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {openLocalIdentity} from '../src/identity.mjs';
import {signReport} from '../src/protocol.mjs';
import {DurableRegionalIngest} from '../src/durable-ingest.mjs';
import {SignedOutbox} from '../src/outbox.mjs';

const NOW=Date.UTC(2026,10,6,22);
const REPORT={schema:'pulsemesh.activity.v1',area:'failure-test',
 bucketStart:NOW-20*60_000,bucketSeconds:60,
 activityIndex:25,metric:'ble_alias_activity'};
const WINDOW={complete:true,bucketStart:REPORT.bucketStart,
 bucketSeconds:60,observedAliases:35};
const POLICY={consent:true,area:REPORT.area};
function fixture(fn){
 const dir=mkdtempSync(path.join(tmpdir(),'pulsemesh-fault-'));
 try{
  const key=openLocalIdentity(path.join(dir,'identity'));
  const dbPath=path.join(dir,'data','store.sqlite');
  return fn({key,dbPath});
 }finally{rmSync(dir,{recursive:true,force:true});}
}

test('indexer failure after report insert rolls back report and replay watermark; retry commits once',()=>fixture(({key,dbPath})=>{
 const options={dbPath,authorizedKeys:new Set([key.keyId]),now:()=>NOW};
 let ingest=new DurableRegionalIngest(options);
 const signed=signReport(REPORT,key,1);
 ingest.db.exec(`CREATE TRIGGER fail_watermark BEFORE INSERT ON contributor_sequences
 BEGIN SELECT RAISE(ABORT,'injected watermark failure'); END;`);
 assert.throws(()=>ingest.ingest(signed),/injected watermark failure/);
 assert.equal(ingest.stats().accepted,0);
 assert.equal(ingest.stats().contributors,0);
 ingest.close();
 ingest=new DurableRegionalIngest(options);
 assert.equal(ingest.stats().accepted,0);
 ingest.db.exec('DROP TRIGGER fail_watermark');
 const accepted=ingest.ingest(signed);
 assert.equal(accepted.ack,true);
 assert.equal(accepted.accepted,true);
 assert.equal(ingest.ingest(signed).duplicate,true);
 assert.equal(ingest.stats().accepted,1);
 assert.equal(ingest.stats().contributors,1);
 ingest.close();
}));

test('indexer insert failure does not advance replay sequence',()=>fixture(({key,dbPath})=>{
 const ingest=new DurableRegionalIngest({dbPath,authorizedKeys:new Set([key.keyId]),now:()=>NOW});
 const signed=signReport(REPORT,key,1);
 ingest.db.exec(`CREATE TRIGGER fail_report BEFORE INSERT ON accepted_reports
 BEGIN SELECT RAISE(ABORT,'injected report failure'); END;`);
 assert.throws(()=>ingest.ingest(signed),/injected report failure/);
 assert.deepEqual(ingest.stats(),{accepted:0,contributors:0,authorizedKeys:1});
 ingest.db.exec('DROP TRIGGER fail_report');
 assert.equal(ingest.ingest(signed).accepted,true);
 ingest.close();
}));

test('outbox enqueue failure rolls back signed report and next sequence across restart',()=>fixture(({key,dbPath})=>{
 const options={dbPath,identity:key,now:()=>NOW};
 let outbox=new SignedOutbox(options);
 outbox.setConsent(true);
 outbox.db.exec(`CREATE TRIGGER fail_sequence BEFORE UPDATE OF next_sequence ON config
 BEGIN SELECT RAISE(ABORT,'injected sequence failure'); END;`);
 assert.throws(()=>outbox.enqueue(WINDOW,POLICY),/injected sequence failure/);
 assert.equal(outbox.stats().queued,0);
 assert.equal(outbox.db.prepare('SELECT next_sequence FROM config WHERE id=1').get().next_sequence,1);
 outbox.close();
 outbox=new SignedOutbox(options);
 assert.equal(outbox.stats().queued,0);
 outbox.db.exec('DROP TRIGGER fail_sequence');
 const first=outbox.enqueue(WINDOW,POLICY);
 assert.equal(first.ok,true);
 assert.equal(first.sequence,1);
 assert.equal(outbox.pending()[0].envelope.body.reportId,first.reportId);
 outbox.close();
}));

test('outbox consent-revocation failure rolls back consent change and pending deletion',()=>fixture(({key,dbPath})=>{
 const outbox=new SignedOutbox({dbPath,identity:key,now:()=>NOW});
 outbox.setConsent(true);
 assert.equal(outbox.enqueue(WINDOW,POLICY).ok,true);
 outbox.db.exec(`CREATE TRIGGER fail_delete BEFORE DELETE ON outgoing
 BEGIN SELECT RAISE(ABORT,'injected deletion failure'); END;`);
 assert.throws(()=>outbox.setConsent(false),/injected deletion failure/);
 assert.equal(outbox.enabled,true);
 assert.equal(outbox.stats().queued,1);
 outbox.db.exec('DROP TRIGGER fail_delete');
 outbox.setConsent(false);
 assert.equal(outbox.enabled,false);
 assert.equal(outbox.stats().queued,0);
 outbox.close();
}));
