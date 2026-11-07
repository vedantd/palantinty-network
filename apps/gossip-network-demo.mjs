#!/usr/bin/env node
/**
 * M07: five independent libp2p peers: 2 synthetic publishers,
 * 1 subscribed relay and 2 independently persisted regional indexers.
 * All sockets bind to 127.0.0.1. No real sensor or public networking.
 */
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {openLocalIdentity} from '../src/identity.mjs';
import {signReport} from '../src/protocol.mjs';
import {DurableRegionalIngest} from '../src/durable-ingest.mjs';
import {createGossipNode,publishSignedAggregate,subscribeRegionalAggregates,subscribeRelay,topicForArea}
 from '../src/gossip-network.mjs';

const root=mkdtempSync(path.join(tmpdir(),'palantiny-m07-'));
const nodes=[],closers=[];
const area='synthetic-region-07';
const now=Date.UTC(2026,10,6,20);
const report=value=>({schema:'pulsemesh.activity.v1',area,
 bucketStart:now-20*60_000,bucketSeconds:60,activityIndex:value,metric:'ble_alias_activity'});
async function until(check,label,timeout=13_000){
 const deadline=Date.now()+timeout;
 while(Date.now()<deadline){if(check())return;await sleep(80);}
 throw new Error('Timed out waiting for '+label);
}
try{
 const identities=[0,1].map(i=>openLocalIdentity(path.join(root,'identity-'+i)));
 const allowed=new Set(identities.map(i=>i.keyId));
 for(let i=0;i<5;i++)nodes.push(await createGossipNode());
 const [publisherA,publisherB,relay,indexerA,indexerB]=nodes;
 const indexes=[0,1].map(i=>new DurableRegionalIngest({
  dbPath:path.join(root,'regional-'+i,'index.sqlite'),
  authorizedKeys:allowed,now:()=>now,minOperators:2
 }));
 closers.push(...indexes.map(x=>()=>x.close()));
 const subscriptions=[subscribeRegionalAggregates(indexerA,{area,ingest:indexes[0]}),
  subscribeRegionalAggregates(indexerB,{area,ingest:indexes[1]}),
  subscribeRelay(relay,area)];
 closers.push(...subscriptions.map(x=>()=>x.close()));
 // Explicit local peer graph. DHT and NAT traversal are separate milestones.
 for(let i=0;i<nodes.length;i++){
  for(let j=i+1;j<nodes.length;j++){
   const remote=nodes[j];
   await nodes[i].peerStore.patch(remote.peerId,{multiaddrs:remote.getMultiaddrs()});
   await nodes[i].dial(remote.peerId);
  }
 }
 const topic=topicForArea(area);
 await until(()=>[publisherA,publisherB].every(n=>
  n.services.pubsub.getSubscribers(topic).length>=2),'GossipSub subscriptions');
 const results=[];
 for(const [i,publisher] of [publisherA,publisherB].entries()){
  const signed=signReport(report(i?35:25),identities[i],1);
  results.push(await publishSignedAggregate(publisher,signed));
 }
 await until(()=>indexes.every(x=>x.stats().accepted===2),'independent regional ingestion');
 const rows=indexes.map(x=>x.query({area}));
 if(rows.some(r=>r.length!==1||r[0].relativeBleActivity!==30||r[0].sources!==2))
  throw new Error('Indexer state divergence');
 console.log(JSON.stringify({
  simulation:true,realSensorData:false,loopbackOnly:true,
  nodes:5,publishers:2,relayPeers:1,independentIndexers:2,
  transport:'libp2p-tcp-noise-yamux-gossipsub',
  publicDiscovery:false,durablePubsubDelivery:false,
  published:results.length,acceptedPerIndexer:indexes.map(x=>x.stats().accepted),
  replicatedRegionalResult:rows[0],
  note:'GossipSub delivery on localhost; synthetic only. Replication is best effort, not durable synchronization.'
 },null,2));
} finally{
 for(const close of closers.reverse()){try{close();}catch{}}
 await Promise.allSettled(nodes.map(n=>n.stop()));
 rmSync(root,{recursive:true,force:true});
}
