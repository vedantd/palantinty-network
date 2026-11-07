#!/usr/bin/env node
/** P02a — isolated synthetic testnet protocol over localhost libp2p only. */
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {openLocalIdentity} from '../src/identity.mjs';
import {signReport} from '../src/protocol.mjs';
import {createGossipNode} from '../src/gossip-network.mjs';
import {observeSyntheticTopic,publishSynthetic,syntheticTopic}
 from '../src/synthetic-testnet.mjs';

const root=mkdtempSync(path.join(tmpdir(),'palantiny-testnet-'));
const area='synthetic-testnet-demo',now=Date.UTC(2026,10,6,20);
const peers=[];let observer;
const until=async(check,label)=>{
 const deadline=Date.now()+10_000;
 while(Date.now()<deadline){
  if(check())return;
  await sleep(50);
 }
 throw Error('Timed out waiting for '+label);
};
try{
 const keys=[0,1].map(i=>openLocalIdentity(path.join(root,'signer-'+i)));
 const [a,b,c]=await Promise.all(Array.from({length:3},()=>createGossipNode()));
 peers.push(a,b,c);
 const messages=[];
 observer=observeSyntheticTopic(c,{area,onSynthetic:e=>messages.push(e)});
 await a.peerStore.patch(b.peerId,{multiaddrs:b.getMultiaddrs()});
 await a.dial(b.peerId);
 await b.peerStore.patch(c.peerId,{multiaddrs:c.getMultiaddrs()});
 await b.dial(c.peerId);
 // GossipSub needs explicit topic subscribers; an un-subscribed relay does
 // not magically forward messages. Connect publishers to the subscribed
 // indexer and also subscribe the middle peer as a testnet relay.
 b.services.pubsub.subscribe(syntheticTopic(area));
 await a.peerStore.patch(c.peerId,{multiaddrs:c.getMultiaddrs()});
 await a.dial(c.peerId);
 await until(()=>a.services.pubsub.getSubscribers(observer.topic)
  .some(peer=>peer.toString()===c.peerId.toString()),
  'actual observer synthetic topic subscription');
// A subscribed relay is not proof that the intended observing peer has joined.
// Allow a GossipSub heartbeat before emitting the first test report.
await sleep(1_200);
 for(const [i,key]of keys.entries()){
  const envelope=signReport({schema:'pulsemesh.activity.v1',
    area,bucketStart:now-20*60_000,bucketSeconds:60,
    activityIndex:i?35:25,metric:'ble_alias_activity'},key,1);
  await publishSynthetic(a,envelope);
 }
 await until(()=>messages.length===2,'two synthetic reports');
 if(messages.some(x=>!x.syntheticOnly||Object.hasOwn(x,'envelope')))
  throw Error('Testnet observer leaked signed envelope');
 console.log(JSON.stringify({
  simulation:true,realSensorData:false,localhostOnly:true,
  peers:3,acceptedSyntheticMessages:messages.length,
  isolatedTopic:observer.topic,publicParticipationEnabled:false,
  verifiedLocation:false,
  durableDeliveryGuaranteed:false,
  note:'This is a synthetic protocol boundary, NOT evidence that untrusted user input is actually synthetic.'
 },null,2));
}finally{
 observer?.close();
 try{peers[1]?.services.pubsub.unsubscribe(syntheticTopic(area));}catch{}
 await Promise.allSettled(peers.map(x=>x.stop()));
 rmSync(root,{recursive:true,force:true});
}
