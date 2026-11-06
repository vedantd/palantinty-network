#!/usr/bin/env node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openLocalIdentity } from '../src/identity.mjs';
import { SignedOutbox } from '../src/outbox.mjs';
import { verifyEnvelope } from '../src/protocol.mjs';

const root=mkdtempSync(path.join(tmpdir(),'pulsemesh-m03-demo-'));
try {
  const identity=openLocalIdentity(path.join(root,'identity'));
  const now=Date.now();
  const queue=new SignedOutbox({dbPath:path.join(root,'outbox','pending.sqlite'),
    identity,now:()=>now});
  try {
    const sample={complete:true,bucketStart:now-20*60_000,
      bucketSeconds:60,observedAliases:35};
    const policy={consent:true,area:'synthetic-demo-cell'};
    const before=queue.enqueue(sample,policy);
    queue.setConsent(true); // Explicitly enabled for synthetic demo only.
    const created=queue.enqueue(sample,policy);
    const ready=queue.pending();
    if(!created.ok || ready.length!==1) throw new Error('Demo queue failed');
    verifyEnvelope(ready[0].envelope);
    console.log(JSON.stringify({
      simulation:true,network:false,consentBefore:before.reason,
      queued:queue.stats().queued,signatureVerified:true,
      protocol:ready[0].envelope.body.schema,
      activityIndex:ready[0].envelope.body.report.activityIndex,
      note:'No hardware scanned and no data transmitted.'
    },null,2));
  } finally {queue.close();}
} finally {rmSync(root,{recursive:true,force:true});}
