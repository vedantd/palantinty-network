#!/usr/bin/env node
/** D03: DHT region→two approved indexers→Noise-authenticated signed aggregate
 * queries. Independent keys and SQLite files on one host; synthetic only.
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

const root=mkdtempSync(path.join(tmpdir(),'palantiny-d03-'));
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
 const ids=await Promise.all(['client','bootstrap','index-a','index-b']
  .map(label=>openPersistentPeerIdentity(path.join(root,label))));
 const [client,router,indexerA,indexerB]=await Promise.all(ids.map(async x=>{
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
 for(const label of ['index-a','index-b']){
  const ingest=new DurableRegionalIngest({dbPath:path.join(root,label,'index.sqlite'),
   authorizedKeys,minOperators:2,now:()=>now});
  stores.push(ingest);
  for(const signed of [first,second])
   if(!ingest.ingest(signed).accepted)throw Error('Failed signed SQLite seed');
 }
 const allowedClients=new Set([client.peerId.toString()]);
 for(const [indexer,i] of [[indexerA,2],[indexerB,3]]){
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
 await retry(()=>announcePrivateRegion(indexerA,region));
 await retry(()=>announcePrivateRegion(indexerB,region));
 const approvedIndexerPeerIds=new Set([indexerA.peerId.toString(),
  indexerB.peerId.toString()]);
 const discovery=await retry(()=>discoverPrivateRegionIndexers(client,{
  region,approvedIndexerPeerIds,minIndexers:2,timeoutMs:12_000
 }));
 const query={region,discovery,approvedIndexerPeerIds,
  start:now-60*60_000,end:now-16*60_000,limit:4,clock:()=>now};
 const consistent=await queryDiscoveredPrivateRegion(client,query);
 if(consistent.status!=='consistent'||consistent.rows.length!==1||
    consistent.rows[0].sources!==2||
    consistent.rows[0].relativeBleActivity!==30)
  throw Error('D03 two independent signed SQLite aggregates did not agree');
 const missing=await queryDiscoveredPrivateRegion(client,{
  ...query,start:now-4*60*60_000,end:now-3*60*60_000
 });
 if(missing.status!=='no-data'||missing.rows.length)
  throw Error('D03 missing measurements must never be reported as zero');
 if(!stores[1].ingest(third).accepted)
  throw Error('D03 failed to seed one-sided indexer divergence');
 const disputed=await queryDiscoveredPrivateRegion(client,query);
 if(disputed.status!=='disagreement'||disputed.rows.length)
  throw Error('D03 must withhold inconsistent regional measurements');
 if(handlers.filter(h=>h.stats().served>=3).length!==2)
  throw Error('D03 each signed stream must be served by both indexers');
 console.log(JSON.stringify({
  milestone:'d03-discovered-two-indexer-signed-aggregate-quorum',
  nodeCount:4,independentIndexerKeys:true,
  independentlyAdministeredHosts:false,
  twoDurableSQLiteIndexers:true,
  sharedCentralRegionDirectory:false,
  regionIsFictional:true,
  queryUsesNoiseAuthenticatedStreams:true,
  queryRepliesPeerIdBoundSigned:true,
  consistent:{status:consistent.status,rows:consistent.rows},
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
