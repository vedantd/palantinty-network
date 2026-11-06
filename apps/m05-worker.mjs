#!/usr/bin/env node
/** M05 test worker. Intended to be started only by the localhost demo. */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { multiaddr } from '@multiformats/multiaddr';
import { createPrivateNode, registerPrivateIngest, sendPrivateReport } from '../src/private-transport.mjs';
import { DurableRegionalIngest } from '../src/durable-ingest.mjs';
import { SignedOutbox } from '../src/outbox.mjs';
import { openLocalIdentity } from '../src/identity.mjs';

const { ROLE, STATE_DIR, ALLOWED_KEYS, FIXED_NOW } = process.env;
if (!process.send || !['indexer','contributor'].includes(ROLE) ||
    !STATE_DIR || !FIXED_NOW || !Number.isSafeInteger(Number(FIXED_NOW)))
  throw new Error('This worker requires the controlled M05 parent process');

let server, queue, ingest;
const node = await createPrivateNode();
try {
  if (ROLE === 'indexer') {
    const keys = JSON.parse(ALLOWED_KEYS ?? '[]');
    ingest = new DurableRegionalIngest({
      dbPath:path.join(STATE_DIR,'regional.sqlite'),
      authorizedKeys:new Set(keys),now:()=>Number(FIXED_NOW)
    });
    registerPrivateIngest(node,ingest);
  } else {
    const identity = openLocalIdentity(path.join(STATE_DIR,'identity'));
    queue = new SignedOutbox({
      dbPath:path.join(STATE_DIR,'outbox','pending.sqlite'),
      identity,now:()=>Number(FIXED_NOW)
    });
  }
  process.send({type:'ready',role:ROLE,peerId:node.peerId.toString(),
    address:node.getMultiaddrs().map(a=>a.toString())[0]});
} catch(error) {
  await node.stop();
  throw error;
}

process.on('message',async msg=>{
  if (!msg || !Number.isSafeInteger(msg.id)) return;
  const done=outcome=>process.send({type:'response',id:msg.id,...outcome});
  try {
    if (msg.action==='prepare' && queue) {
      queue.setConsent(true); // Explicit opt-in for synthetic demo only.
      const outcome=queue.enqueue({
        complete:true,bucketStart:msg.bucketStart,
        bucketSeconds:60,observedAliases:msg.aliases
      },{consent:true,area:'synthetic-m05-region'});
      done({outcome,stats:queue.stats()});
    } else if (msg.action==='send' && queue) {
      if (typeof msg.address!=='string' ||
          !/^\/ip4\/127\.0\.0\.1\/tcp\/\d+\/p2p\//.test(msg.address))
        throw new Error('Expected authenticated loopback peer multiaddr');
      const item=queue.pending(1)[0];
      if (!item) {done({delivered:false,reason:'nothing_pending',stats:queue.stats()});return;}
      const response=await sendPrivateReport(node,multiaddr(msg.address),item.envelope);
      const match=response.ack === true &&
        response.reportId === item.envelope.body.reportId &&
        (response.accepted === true || response.duplicate === true);
      if (match && msg.honorAck !== false) queue.acknowledge(response.reportId);
      done({delivered:match,response,stats:queue.stats(),honored:msg.honorAck!==false});
    } else if (msg.action==='query' && ingest) {
      done({rows:ingest.query({area:'synthetic-m05-region'}),stats:ingest.stats()});
    } else if (msg.action==='stop') {
      done({stopped:true});
      queue?.close(); ingest?.close();
      await node.stop();
      process.exit(0);
    } else {
      throw new Error('Unrecognized role/action');
    }
  } catch(error) {done({error:error.message});}
});
