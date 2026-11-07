#!/usr/bin/env node
/** M08b: three isolated libp2p peers: A knows only B, B knows C,
 * and A resolves C through the sandbox Kademlia routing protocol.
 */
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {createGossipNode,subscribeRegionalAggregates,publishSignedAggregate,topicForArea}
 from '../src/gossip-network.mjs';
import {openLocalIdentity} from '../src/identity.mjs';
import {signReport} from '../src/protocol.mjs';
import {DurableRegionalIngest} from '../src/durable-ingest.mjs';
const root=mkdtempSync(path.join(tmpdir(),'palantiny-m08b-'));
const nodes=[];
const area='synthetic-kad-region', now=Date.UTC(2026,10,6,20);
const wait=async(fn,label)=>{
 const deadline=Date.now()+12_000;
 while(Date.now()<deadline){if(await fn())return;await delay(120);}
 throw new Error('Timed out: '+label);
};
let store,sub;
try{
 const identity=openLocalIdentity(path.join(root,'id'));
 const [a,b,c]=await Promise.all(Array.from({length:3},()=>createGossipNode({enableDht:true})));
 nodes.push(a,b,c);
 store=new DurableRegionalIngest({dbPath:path.join(root,'regional','index.sqlite'),
  authorizedKeys:new Set([identity.keyId]),now:()=>now});
 sub=subscribeRegionalAggregates(c,{area,ingest:store});
 // A has one manually-known seed B. B knows C. No mandatory collector.
 await a.peerStore.patch(b.peerId,{multiaddrs:b.getMultiaddrs()});
 await a.dial(b.peerId);
 await b.peerStore.patch(c.peerId,{multiaddrs:c.getMultiaddrs()});
 await b.dial(c.peerId);
 let found;
 await wait(async()=>{
  try{
   found=await a.peerRouting.findPeer(c.peerId,{signal:AbortSignal.timeout(2500)});
   return found?.id?.toString()===c.peerId.toString()&&found.multiaddrs.length>0;
  }catch{return false;}
 },'routing peer C via B');
 await a.peerStore.patch(c.peerId,{multiaddrs:found.multiaddrs});
 await a.dial(c.peerId);
 const topic=topicForArea(area);
 await wait(()=>a.services.pubsub.getSubscribers(topic).length>0,'indexer topic subscription');
 const env=signReport({schema:'pulsemesh.activity.v1',area,
  bucketStart:now-20*60_000,bucketSeconds:60,activityIndex:30,
  metric:'ble_alias_activity'},identity,1);
 await publishSignedAggregate(a,env);
 await wait(()=>store.stats().accepted===1,'signed regional delivery after DHT peer discovery');
 console.log(JSON.stringify({simulation:true,loopbackOnly:true,
  protocol:'libp2p-kad-dht-gossipsub',peers:3,
  manuallySeededConnections:1,discoveredThirdPeerViaDht:true,
  authenticatedSyntheticReports:store.stats().accepted,
  peerDiscoveryIsLocationAttestation:false,
  note:'Private loopback DHT experiment. No public discovery, bootstrap service, real sensor data, or NAT traversal.'
 },null,2));
}finally{
 try{sub?.close()}catch{}
 try{store?.close()}catch{}
 await Promise.allSettled(nodes.map(n=>n.stop()));
 rmSync(root,{recursive:true,force:true});
}
