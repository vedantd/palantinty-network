#!/usr/bin/env node
/**
 * M09a: sender-assisted, encrypted reconciliation after one indexer misses
 * an intermediate synthetic report, then sees a newer sequence.
 */
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {openLocalIdentity} from '../src/identity.mjs';
import {SignedOutbox} from '../src/outbox.mjs';
import {DurableRegionalIngest} from '../src/durable-ingest.mjs';
import {createPrivateNode,registerPrivateIngest,sendPrivateReport} from '../src/private-transport.mjs';
import {replaySignedHistory} from '../src/history-replay.mjs';
const root=mkdtempSync(path.join(tmpdir(),'palantiny-m09-'));
const nodes=[],closers=[];
const area='synthetic-replay-region',now=Date.UTC(2026,10,6,20);
try{
 const identity=openLocalIdentity(path.join(root,'identity'));
 const outbox=new SignedOutbox({dbPath:path.join(root,'outbox','records.sqlite'),
  identity,now:()=>now});
 outbox.setConsent(true);
 closers.push(()=>outbox.close());
 const stores=[0,1].map(i=>new DurableRegionalIngest({
  dbPath:path.join(root,'indexer-'+i,'index.sqlite'),
  authorizedKeys:new Set([identity.keyId]),now:()=>now
 }));
 closers.push(...stores.map(x=>()=>x.close()));
 const [sender,primary,backup]=await Promise.all([createPrivateNode(),createPrivateNode(),createPrivateNode()]);
 nodes.push(sender,primary,backup);
 registerPrivateIngest(primary,stores[0]);
 registerPrivateIngest(backup,stores[1]);
 for(const peer of [primary,backup])
  await sender.peerStore.patch(peer.peerId,{multiaddrs:peer.getMultiaddrs()});
 for(let i=1;i<=3;i++){
  const result=outbox.enqueue({complete:true,
   bucketStart:now-(21-i)*60_000,bucketSeconds:60,observedAliases:20+i*5},
   {consent:true,area});
  if(!result.ok)throw new Error('Failed to prepare report '+i+': '+result.reason);
 }
 const signed=outbox.signedHistory({area});
 if(signed.length!==3)throw new Error('Missing local signed report history');
 // The backup misses sequence 2, but receives 3: high watermark = 3.
 for(let i=0;i<3;i++){
  const a=await sendPrivateReport(sender,primary.peerId,signed[i]);
  if(!a.ack)throw new Error('Primary did not acknowledge');
  outbox.acknowledge(signed[i].body.reportId);
  if(i!==1){
   const b=await sendPrivateReport(sender,backup.peerId,signed[i]);
   if(!b.ack)throw new Error('Backup did not acknowledge');
  }
 }
 if(stores[0].stats().accepted!==3||stores[1].stats().accepted!==2)
  throw new Error('Wrong pre-replay state');
 const addr=backup.getMultiaddrs()[0].toString();
 const peerAddress=addr.includes('/p2p/')?addr:addr+'/p2p/'+backup.peerId.toString();
 const outcome=await replaySignedHistory({node:sender,outbox,peerAddress,area});
 if(outcome.accepted!==1||outcome.duplicates!==2||outcome.hasMore||
    stores[1].stats().accepted!==3)throw new Error('Gap recovery failed');
 const second=await replaySignedHistory({node:sender,outbox,peerAddress,area});
 if(second.accepted!==0||second.duplicates!==3)throw new Error('Replay not idempotent');
 const high=stores[1].db.prepare('SELECT highest_sequence AS n FROM contributor_sequences WHERE key_id=?')
  .get(identity.keyId).n;
 if(high!==3)throw new Error('High-water replay regressed');
 console.log(JSON.stringify({simulation:true,loopbackOnly:true,
  transport:'encrypted-libp2p-direct-replay',twoIndependentIndexers:true,
  missingIntermediateSequence:2,replayed:outcome.confirmed,
  newlyAccepted:outcome.accepted,alreadyKnown:outcome.duplicates,
  primaryAccepted:stores[0].stats().accepted,backupAccepted:stores[1].stats().accepted,
  idempotentSecondReplay:second.duplicates===3,
  note:'Recovery requires original sender and retained signed history; no indexer-to-indexer anti-entropy yet.'
 },null,2));
}finally{
 for(const c of closers.reverse())try{c()}catch{}
 await Promise.allSettled(nodes.map(n=>n.stop()));
 rmSync(root,{recursive:true,force:true});
}
