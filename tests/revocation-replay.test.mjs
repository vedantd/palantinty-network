import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {openLocalIdentity} from '../src/identity.mjs';
import {SignedOutbox} from '../src/outbox.mjs';
const NOW=Date.UTC(2026,10,6,20),area='synthetic-revoke';
test('revocation purges acknowledged and pending signed history permanently even if reenabled',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'palantiny-revoke-'));
 try{
  const identity=openLocalIdentity(path.join(dir,'identity'));
  const options={dbPath:path.join(dir,'db','outbox.sqlite'),identity,now:()=>NOW};
  let outbox=new SignedOutbox(options);
  outbox.setConsent(true);
  const add=(m)=>outbox.enqueue({complete:true,bucketStart:NOW-m*60_000,
   bucketSeconds:60,observedAliases:30},{consent:true,area});
  const a=add(20),b=add(19);
  assert.equal(a.ok,true);assert.equal(b.ok,true);
  assert.equal(outbox.acknowledge(a.reportId),true);
  assert.equal(outbox.signedHistory({area}).length,2);
  outbox.setConsent(false);
  assert.equal(outbox.stats().acknowledged,0);
  assert.equal(outbox.stats().queued,0);
  assert.equal(outbox.db.prepare('SELECT count(*) AS n FROM outgoing').get().n,0);
  const next=outbox.db.prepare('SELECT next_sequence AS seq FROM config WHERE id=1').get().seq;
  assert.equal(next,3); // Revocation cannot regress the signing sequence.
  outbox.close();
  outbox=new SignedOutbox(options);
  outbox.setConsent(true);
  assert.deepEqual(outbox.signedHistory({area}),[]);
  assert.equal(add(18).sequence,3);
  assert.deepEqual(outbox.signedHistory({area}).map(e=>e.body.sequence),[3]);
  outbox.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
