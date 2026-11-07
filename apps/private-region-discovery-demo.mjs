#!/usr/bin/env node
/** D02a: four separately keyed localhost nodes, zero region→indexer registry.
 * Client knows bootstrap B and an approved Peer ID set, never indexer regions.
 * Kademlia content providers for one fictional region lead to two direct,
 * Noise-authenticated signed coverage reads. No real data or public listeners.
 */
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {createGossipNode} from '../src/gossip-network.mjs';
import {openPersistentPeerIdentity} from '../src/operator-identity.mjs';
import {syntheticRegionKey} from '../src/private-synthetic-region.mjs';
import {registerPrivateRegionCoverage,announcePrivateRegion,
 discoverPrivateRegionIndexers} from '../src/private-region-discovery.mjs';

const root=mkdtempSync(path.join(tmpdir(),'palantiny-d02a-'));
const nodes=[],handlers=[];
const region=syntheticRegionKey({scenario:'demoregion',cellIndex:1});
const secondary=syntheticRegionKey({scenario:'demoregion',cellIndex:2});
const boot=(a,b)=>a.peerStore.patch(b.peerId,{multiaddrs:b.getMultiaddrs()})
 .then(()=>a.dial(b.peerId));
async function retry(action,name,deadlineMs=15_000){
 let last,deadline=Date.now()+deadlineMs;
 while(Date.now()<deadline){
  try{return await action();}
  catch(e){last=e;await delay(350);}
 }
 throw Error(name+' failed after retries: '+String(last?.message??last));
}
try{
 const ids=await Promise.all(['client','bootstrap','indexer-one','indexer-two']
  .map(label=>openPersistentPeerIdentity(path.join(root,label))));
 const [client,router,indexerOne,indexerTwo]=await Promise.all(ids.map(async x=>{
  const node=await createGossipNode({enableDht:true,privateKey:x.privateKey});
  nodes.push(node);return node;
 }));
 const allowedClients=new Set([client.peerId.toString()]);
 handlers.push(registerPrivateRegionCoverage(indexerOne,{
  privateKey:ids[2].privateKey,regions:[region,secondary],
  approvedClientPeerIds:allowedClients
 }));
 handlers.push(registerPrivateRegionCoverage(indexerTwo,{
  privateKey:ids[3].privateKey,regions:[region],
  approvedClientPeerIds:allowedClients
 }));
 // The client is explicitly seeded with ONLY B; neither indexer is
 // preconnected to the client nor mapped to the region.
 await boot(client,router);
 await boot(indexerOne,router);
 await boot(indexerTwo,router);
 await retry(()=>announcePrivateRegion(indexerOne,region),
  'indexer one DHT announcement');
 await retry(()=>announcePrivateRegion(indexerTwo,region),
  'indexer two DHT announcement');
 const approvedIndexerPeerIds=new Set([indexerOne.peerId.toString(),
  indexerTwo.peerId.toString()]);
 const output=await retry(()=>discoverPrivateRegionIndexers(client,{
  region,approvedIndexerPeerIds,minIndexers:2,timeoutMs:12_000
 }),'two independent private indexer coverage queries',24_000);
 const found=new Set(output.results.map(x=>x.peerId));
 if(found.size!==2||found.size!==approvedIndexerPeerIds.size||
    [...found].some(x=>!approvedIndexerPeerIds.has(x))||
    output.results.some(x=>!x.verified||!x.privateTransport)||
    handlers.some(h=>h.stats().served<1))
  throw Error('Both independent indexer coverage streams must verify');
 // Negative: a caller cannot satisfy its two-indexer requirement with a
 // single approved peer, even when that peer claims several fictional cells.
 let insufficientRejected=false;
 try{
  await discoverPrivateRegionIndexers(client,{
   region,approvedIndexerPeerIds:new Set([indexerOne.peerId.toString()]),
   minIndexers:2,timeoutMs:3000
  });
 }catch{insufficientRejected=true;}
 if(!insufficientRejected)throw Error('Single indexer must not satisfy 2-of-2');
 console.log(JSON.stringify({
  milestone:'two-region-indexers-discovered-and-verified',
  fictionalRegion:region,cid:output.cid,
  nodes:4,bootstrapConnectionsFromClient:1,
  indexersDiscoveredFromKademliaProviders:found.size,
  separatelyProvisionedNodeKeys:true,
  realIndependentOperators:false,
  contentRoutingNotKnownPeerLookup:true,
  directNoiseEncryptedCoverageStreams:true,
  cryptographicallyPeerIdBoundCoverage:true,
  approvedPeerListStillRequired:true,
  sharedCentralRegionDirectory:false,
  publicNetwork:false,realSensorReports:false,
  launchGateEvidence:false
 },null,2));
}finally{
 for(const h of handlers)try{h.close();}catch{}
 await Promise.allSettled(nodes.map(n=>n.stop()));
 rmSync(root,{recursive:true,force:true});
}
