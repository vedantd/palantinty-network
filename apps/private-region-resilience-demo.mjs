#!/usr/bin/env node
/** D03b: 3 independently keyed localhost indexers via Kademlia: one
 * offline indexer leaves a bounded 2-of-3 quorum; split-brain is rejected.
 */
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {createGossipNode} from '../src/gossip-network.mjs';
import {openPersistentPeerIdentity} from '../src/operator-identity.mjs';
import {openLocalIdentity} from '../src/identity.mjs';
import {signReport} from '../src/protocol.mjs';
import {DurableRegionalIngest} from '../src/durable-ingest.mjs';
import {syntheticRegionKey} from '../src/private-synthetic-region.mjs';
import {announcePrivateRegion,registerPrivateRegionCoverage,
 discoverPrivateRegionIndexers} from '../src/private-region-discovery.mjs';
import {registerPrivateSyntheticQuery,queryDiscoveredPrivateRegion,
 syntheticAreaForRegion} from '../src/private-region-query.mjs';

const root=mkdtempSync(path.join(tmpdir(),'palantiny-d03b-'));
const nodes=[],handlers=[],stores=[];
const now=Date.now(),bucketStart=Math.floor((now-22*60_000)/60_000)*60_000;
const region=syntheticRegionKey({scenario:'demoregion',cellIndex:1});
const area=syntheticAreaForRegion(region);
const boot=(a,b)=>a.peerStore.patch(b.peerId,{multiaddrs:b.getMultiaddrs()})
 .then(()=>a.dial(b.peerId));
async function retry(action,deadlineMs=25_000){
 let last,deadline=Date.now()+deadlineMs;
 while(Date.now()<deadline){
  try{return await action();}
  catch(error){last=error;await delay(400);}
 }
 throw Error('D03 private discovery failed: '+String(last?.message??last));
}
try{
 const ids=await Promise.all(['client','bootstrap','index-a','index-b','index-c']
  .map(label=>openPersistentPeerIdentity(path.join(root,label))));
 const [client,router,indexerA,indexerB,indexerC]=await Promise.all(ids.map(async x=>{
  const node=await createGossipNode({enableDht:true,privateKey:x.privateKey});
  nodes.push(node);return node;
 }));
 const signers=['contributor-a','contributor-b','contributor-c']
  .map(label=>openLocalIdentity(path.join(root,label)));
 const authorizedKeys=new Set(signers.map(s=>s.keyId));
 const report=(value)=>({
  schema:'pulsemesh.activity.v1',area,bucketStart,bucketSeconds:60,
  activityIndex:value,metric:'ble_alias_activity'
 });
 const first=signReport(report(25),signers[0],1);
 const second=signReport(report(35),signers[1],1);
 const third=signReport(report(45),signers[2],1);
 for(const label of ['index-a','index-b','index-c']){
  const ingest=new DurableRegionalIngest({dbPath:path.join(root,label,'index.sqlite'),
   authorizedKeys,minOperators:2,now:()=>now});
  stores.push(ingest);
  for(const signed of [first,second])
   if(!ingest.ingest(signed).accepted)throw Error('Failed signed SQLite seed');
 }
 const allowedClients=new Set([client.peerId.toString()]);
 for(const [indexer,i] of [[indexerA,2],[indexerB,3],[indexerC,4]]){
  handlers.push(registerPrivateRegionCoverage(indexer,{
   privateKey:ids[i].privateKey,regions:[region],approvedClientPeerIds:allowedClients
  }));
  handlers.push(registerPrivateSyntheticQuery(indexer,{
   privateKey:ids[i].privateKey,region,ingest:stores[i-2],
   approvedClientPeerIds:allowedClients,clock:()=>now
  }));
 }
 await boot(client,router);
 await boot(indexerA,router);
 await boot(indexerB,router);
 await boot(indexerC,router);
 await retry(()=>announcePrivateRegion(indexerA,region));
 await retry(()=>announcePrivateRegion(indexerB,region));
 await retry(()=>announcePrivateRegion(indexerC,region));
 const approvedIndexerPeerIds=new Set([indexerA.peerId.toString(),
  indexerB.peerId.toString(),indexerC.peerId.toString()]);
 const discovery=await retry(()=>discoverPrivateRegionIndexers(client,{
  region,approvedIndexerPeerIds,minIndexers:3,timeoutMs:12_000
 }));
 if(discovery.results.length!==3)throw Error('D03b requires three DHT region providers');
 const query={region,discovery,approvedIndexerPeerIds,
  start:now-60*60_000,end:now-16*60_000,limit:4,clock:()=>now};
 const consistent=await queryDiscoveredPrivateRegion(client,query);
 if(consistent.status!=='consistent'||consistent.rows.length!==1||
    consistent.rows[0].sources!==2||
    consistent.rows[0].relativeBleActivity!==30)
  throw Error('D03b three signed SQLite aggregates did not agree');
 const missing=await queryDiscoveredPrivateRegion(client,{
  ...query,start:now-4*60*60_000,end:now-3*60*60_000
 });
 if(missing.status!=='no-data'||missing.rows.length)
  throw Error('D03 missing measurements must never be reported as zero');
 // Deliberately terminate a real peer after verified DHT discovery.
 // A stale DHT advertisement must not be enough to fake a response.
 await indexerC.stop();
 const degraded=await queryDiscoveredPrivateRegion(client,query);
 if(degraded.status!=='consistent'||degraded.sources!==2||
    degraded.unavailableCount!==1||degraded.rows[0]?.relativeBleActivity!==30)
  throw Error('D03b 2-of-3 outage tolerance failed');
 if(!stores[1].ingest(third).accepted)
  throw Error('D03b failed to seed one-sided indexer divergence');
 const disputed=await queryDiscoveredPrivateRegion(client,query);
 if(disputed.status!=='disagreement'||disputed.rows.length||
    disputed.sources!==2||disputed.unavailableCount!==1)
  throw Error('D03b must withhold split-brain measurements after outage');
 if(handlers.filter(h=>h.stats().served>=3).length!==2)
  throw Error('D03b both surviving indexers must answer signed queries');
 console.log(JSON.stringify({
  milestone:'d03b-private-three-indexer-quorum-with-real-transport-outage',
  nodeCount:5,independentIndexerKeys:true,
  independentlyAdministeredHosts:false,
  threeDurableSQLiteIndexers:true,
  sharedCentralRegionDirectory:false,
  regionIsFictional:true,
  queryUsesNoiseAuthenticatedStreams:true,
  queryRepliesPeerIdBoundSigned:true,
  consistent:{status:consistent.status,rows:consistent.rows},
  outage:{stoppedIndexer:'index-c',status:degraded.status,
    verifiedResponses:degraded.sources,unavailable:degraded.unavailableCount},
  missingData:missing.status,
  divergentData:disputed.status,divergentRowsReleased:disputed.rows.length,
  publicNetwork:false,realSensorReports:false,releaseGateEvidence:false
 },null,2));
}finally{
 for(const handler of handlers)try{handler.close();}catch{}
 await Promise.allSettled(nodes.map(n=>n.stop()));
 for(const store of stores)try{store.close();}catch{}
 rmSync(root,{recursive:true,force:true});
}
