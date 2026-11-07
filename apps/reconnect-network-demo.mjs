#!/usr/bin/env node
/**
 * M08a: controlled loopback peer reconnect with a deliberately missed report.
 * Demonstrates a GossipSub gap — and documents why M09 anti-entropy is needed.
 */
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {openLocalIdentity} from '../src/identity.mjs';
import {signReport} from '../src/protocol.mjs';
import {DurableRegionalIngest} from '../src/durable-ingest.mjs';
import {createGossipNode,subscribeRegionalAggregates,publishSignedAggregate,topicForArea}
 from '../src/gossip-network.mjs';
import {connectLocalSeed} from '../src/peer-bootstrap.mjs';

const dir=mkdtempSync(path.join(tmpdir(),'palantiny-m08-'));
const nodes=[],closers=[];
const now=Date.UTC(2026,10,6,20),area='synthetic-reconnect';
const identity=openLocalIdentity(path.join(dir,'contributor'));
const until=async(check,label)=>{
 const deadline=Date.now()+12_000;
 while(Date.now()<deadline){if(check())return;await delay(100);}
 throw new Error('Timed out waiting for '+label);
};
try {
 const [publisher,primary,backup]=await Promise.all([createGossipNode(),createGossipNode(),createGossipNode()]);
 nodes.push(publisher,primary,backup);
 const indices=[0,1].map(i=>new DurableRegionalIngest({
  dbPath:path.join(dir,'db-'+i,'index.sqlite'),
  authorizedKeys:new Set([identity.keyId]),now:()=>now,minOperators:2
 }));
 closers.push(...indices.map(x=>()=>x.close()));
 const subs=[subscribeRegionalAggregates(primary,{area,ingest:indices[0]}),
  subscribeRegionalAggregates(backup,{area,ingest:indices[1]})];
 closers.push(...subs.map(s=>()=>s.close()));
 const address=node=>{const base=node.getMultiaddrs()[0].toString();
  return base.includes('/p2p/')?base:base+'/p2p/'+node.peerId.toString();};
 await connectLocalSeed(publisher,address(primary));
 await connectLocalSeed(publisher,address(backup));
 const topic=topicForArea(area);
 await until(()=>publisher.services.pubsub.getSubscribers(topic).length===2,'two subscribers');
 const publish=async(sequence)=>{
  const envelope=signReport({schema:'pulsemesh.activity.v1',area,
    bucketStart:now-(21-sequence)*60_000,bucketSeconds:60,
    activityIndex:20+sequence*5,metric:'ble_alias_activity'},identity,sequence);
  await publishSignedAggregate(publisher,envelope);
 };
 await publish(1);
 await until(()=>indices.every(x=>x.stats().accepted===1),'initial delivery');
 await publisher.hangUp(backup.peerId);
 await until(()=>publisher.getConnections(backup.peerId).length===0,'peer disconnection');
 await publish(2);
 await until(()=>indices[0].stats().accepted===2,'primary while backup disconnected');
 if(indices[1].stats().accepted!==1)throw new Error('Backup did not miss expected offline report');
 const reconnection=await connectLocalSeed(publisher,address(backup));
 await until(()=>publisher.services.pubsub.getSubscribers(topic).length===2,'resubscription after reconnect');
 await publish(3);
 await until(()=>indices[0].stats().accepted===3&&indices[1].stats().accepted===2,'post-reconnect delivery');
 console.log(JSON.stringify({simulation:true,loopbackOnly:true,
  network:'gossipsub-trusted-seed',reconnected:reconnection.connected,
  primaryReports:indices[0].stats().accepted,backupReports:indices[1].stats().accepted,
  missingReportDetected:true,durableRecovery:false,
  note:'Reconnect resumes new gossip only; missing historical reports require M09 anti-entropy.'
 },null,2));
} finally {
 for(const closer of closers.reverse())try{closer()}catch{}
 await Promise.allSettled(nodes.map(n=>n.stop()));
 rmSync(dir,{recursive:true,force:true});
}
