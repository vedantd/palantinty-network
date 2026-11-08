#!/usr/bin/env node
/** D02b: same-identity private indexer restart, signed coverage re-discovery
 * via Kademlia and rejection of pre-restart authorized endpoint snapshots.
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

const root=mkdtempSync(path.join(tmpdir(),'palantiny-d02b-restart-'));
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
 // A valid old signature/Peer ID cannot authorize a new listen address.
 const oldAddr=indexerC.getMultiaddrs()[0].toString();
 const persistentKey=ids[4].peerId;
 await indexerC.stop();
 handlers.splice(4,2).forEach(handler=>handler.close());
 stores[2].close();
 // Reload rather than keep the original key object in memory: this tests
 // actual identity persistence and rejects any silent operator-key rotation.
 const reloadedIdentity=await openPersistentPeerIdentity(path.join(root,'index-c'),{create:false});
 if(reloadedIdentity.peerId!==persistentKey)
  throw Error('D02b on-disk identity changed across restart');
 const degraded=await queryDiscoveredPrivateRegion(client,query);
 if(degraded.status!=='consistent'||degraded.sources!==2||
    degraded.unavailableCount!==1)
  throw Error('D02b outage must leave exactly two verified indexers');
 const restored=new DurableRegionalIngest({
  dbPath:path.join(root,'index-c','index.sqlite'),
  authorizedKeys,minOperators:2,now:()=>now
 });
 stores[2]=restored;
 if(restored.stats().accepted!==2)
  throw Error('D02b signed archive did not survive indexer restart');
 // Restart the *same key* on a different ephemeral loopback port.
 // New address arrives through the router/DHT; client is NOT given it.
 let restarted, newAddr;
 for(let attempt=0;attempt<4;attempt++){
  const candidate=await createGossipNode({
   enableDht:true,privateKey:reloadedIdentity.privateKey
  });
  const addr=candidate.getMultiaddrs()[0].toString();
  if(addr!==oldAddr){restarted=candidate;newAddr=addr;break;}
  await candidate.stop();
 }
 if(!restarted)throw Error('D02b could not allocate a fresh loopback port');
 nodes.push(restarted);
 if(restarted.peerId.toString()!==persistentKey)
  throw Error('D02b persistent identity rotated unexpectedly');
 const restartedCoverage=registerPrivateRegionCoverage(restarted,{
  privateKey:reloadedIdentity.privateKey,regions:[region],
  approvedClientPeerIds:allowedClients
 });
 const restartedQuery=registerPrivateSyntheticQuery(restarted,{
  privateKey:reloadedIdentity.privateKey,region,ingest:restored,
  approvedClientPeerIds:allowedClients,clock:()=>now
 });
 handlers.push(restartedCoverage,restartedQuery);
 await boot(restarted,router);
 await retry(()=>announcePrivateRegion(restarted,region),30_000);
 const refreshed=await retry(async()=>{
  const found=await discoverPrivateRegionIndexers(client,{
   region,approvedIndexerPeerIds,minIndexers:3,timeoutMs:12_000
  });
  const newest=found.results.find(x=>x.peerId===persistentKey);
  if(!newest||newest.authenticatedAddress!==newAddr||
     newest.issuedAt<now||!newest.verified)
   throw Error('D02b fresh signed provider endpoint not verified: '+
    JSON.stringify({actual:newest?.authenticatedAddress,
     expected:newAddr,issuedAt:newest?.issuedAt,
     earliest:now,verified:newest?.verified,
     oldAddr,found:found.results.length}));
  return found;
 },18_000);
 const recovered=await queryDiscoveredPrivateRegion(client,{
  ...query,discovery:refreshed
 });
 if(recovered.status!=='consistent'||recovered.sources!==3||
    recovered.rows[0]?.relativeBleActivity!==30)
  throw Error('D02b recovered authenticated 3-indexer query failed');
 // Once reconnected to the fresh port, the OLD coverage result must
 // never be reused even though it names the same trusted Ed25519 Peer ID.
 let staleRefused=false;
 try{await queryDiscoveredPrivateRegion(client,query);}
 catch(error){staleRefused=/refused invalid or unauthenticated/.test(error.message);}
 if(!staleRefused)
  throw Error('D02b stale signed endpoint reused after restart');
 if(restartedCoverage.stats().served<1||restartedQuery.stats().served<1)
  throw Error('D02b restarted indexer did not serve fresh authenticated streams');
 console.log(JSON.stringify({
  milestone:'d02b-private-indexer-same-key-new-port-dht-recovery',
  nodeCount:5,
  fictionalRegion:region,
  operatorIdentityPreserved:restarted.peerId.toString()===persistentKey,
  listenPortChanged:oldAddr!==newAddr,
  durableSignedArchiveSurvivedRestart:true,
  initialQuorum:consistent.status,
  offlineQuorum:{status:degraded.status,responders:degraded.sources,
    unavailable:degraded.unavailableCount},
  refreshedProviderCoverage:refreshed.results.length,
  recoveredQuorum:{status:recovered.status,responders:recovered.sources,
    aggregate:recovered.rows[0]?.relativeBleActivity},
  oldSignedEndpointRefused:staleRefused,
  indexersOnDifferentPhysicalHosts:false,
  publicInternet:false,realSensorData:false,releaseGatesAdvanced:false
 },null,2));

}finally{
 for(const handler of handlers)try{handler.close();}catch{}
 await Promise.allSettled(nodes.map(n=>n.stop()));
 for(const store of stores)try{store.close();}catch{}
 rmSync(root,{recursive:true,force:true});
}
