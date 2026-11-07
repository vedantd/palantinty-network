#!/usr/bin/env node
/**
 * P02c-2 independent-host synthetic pilot.
 * Each operator provisions keys and a private config on their own machine.
 * This runtime has no shared coordination volume and no real BLE input.
 */
import path from 'node:path';
import {lstatSync} from 'node:fs';
import {setTimeout as sleep} from 'node:timers/promises';
import {multiaddr} from '@multiformats/multiaddr';
import {readP02cHostConfig} from '../src/p02c-host-config.mjs';
import {openPersistentPeerIdentity} from '../src/operator-identity.mjs';
import {openLocalIdentity} from '../src/identity.mjs';
import {signReport} from '../src/protocol.mjs';
import {createPinnedSyntheticGossipNode} from '../src/pinned-synthetic-node.mjs';
import {observeSyntheticTopic,publishSynthetic,syntheticTopic} from '../src/synthetic-testnet.mjs';

const [command,filename,roundArg]=process.argv.slice(2);
if(!['preflight','observe','publish'].includes(command)||!filename||
   (command==='publish'&&roundArg===undefined)||
   (command!=='publish'&&roundArg!==undefined)){
 console.error('Usage: node apps/p02c-host-pilot.mjs <preflight|observe|publish> <private-config.json> [round-number]');
 process.exitCode=2;
}else{
 let node,observer;
 const emit=event=>console.log(JSON.stringify({
  schema:'palantiny.p02c-pilot-evidence.v1',syntheticOnly:true,
  publicTestnetReady:false,realSensorData:false,
  pilotId:config.pilotId,role:config.role,localPeerId:identity.peerId,
  remotePeerId:config.remotePeerId,event,...event
 }));
 let config,identity;
 try{
  config=readP02cHostConfig(filename);
  const st=lstatSync(config.stateDir);
  if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0)
   throw Error('Pilot state directory must be private 0700');
  identity=await openPersistentPeerIdentity(path.join(config.stateDir,'operator-identity'),{create:false});
  if(identity.peerId===config.remotePeerId)
   throw Error('Self peer ID cannot be pinned as remote');
  if(command!=='preflight'&&command!==config.role.replace('observer','observe').replace('publisher','publish'))
   throw Error('Command role does not match private config');
  if(command==='publish'&&(!/^[1-9][0-9]{0,4}$/.test(roundArg)||
     Number(roundArg)>10000))
   throw Error('Explicit synthetic fixture round must be 1..10000');
  if(command==='preflight'){
   emit({event:'config-validated',privateNetworkOnly:true,deliveryObserved:false,
    note:'Local checks only; no proof that independent hosts or firewall are configured'});
  }else{
   node=await createPinnedSyntheticGossipNode({
    privateKey:identity.privateKey,
    allowedPeerIds:[config.remotePeerId],
    listen:config.listen,
    allowPrivateLan:config.allowPrivateLan,
    allowedRemoteIps:config.allowedRemoteIps
   });
   if(node.peerId.toString()!==identity.peerId)
    throw Error('Persistent identity mismatch at libp2p startup');
   emit({event:'started',addresses:node.getMultiaddrs().map(addr=>addr.toString()),
    privateNetworkOnly:true,deliveryObserved:false});
   if(command==='observe'){
    const received=[];
    observer=observeSyntheticTopic(node,{area:config.area,onSynthetic:report=>{
     received.push(report);
     emit({event:'received-synthetic-report',reportId:report.reportId,
      area:report.area,deliveryObserved:true});
    }});
    const until=Date.now()+25000;
    while(received.length<1&&Date.now()<until)await sleep(50);
    if(received.length!==1)throw Error('No synthetic report received before timeout');
    emit({event:'observer-complete',accepted:observer.stats().accepted,
     deliveryObserved:true});
   }else{
    const seed=multiaddr(config.remoteSeed);
    let connected=false;
    for(let attempt=1;attempt<=4&&!connected;attempt++){
     try{
      await node.dial(seed,{signal:AbortSignal.timeout(4000)});
      connected=true;
     }catch(e){
      if(attempt===4)throw Error('Verified private seed unreachable',{cause:e});
      await sleep(attempt*200);
     }
    }
    const topic=syntheticTopic(config.area);
    const deadline=Date.now()+10000;
    while(!node.services.pubsub.getSubscribers(topic).some(
     peer=>peer.toString()===config.remotePeerId)&&Date.now()<deadline)
     await sleep(50);
    if(!node.services.pubsub.getSubscribers(topic).some(
      peer=>peer.toString()===config.remotePeerId))
     throw Error('Remote synthetic topic subscription not observed');
    await sleep(1200);
    // No BLE scanner or OS sensing permission is requested.
    const signer=openLocalIdentity(path.join(config.stateDir,'synthetic-fixture-signer'));
    const round=Number(roundArg);
    const envelope=signReport({
     schema:'pulsemesh.activity.v1',area:config.area,
     bucketStart:Date.UTC(2026,10,6,20)+(round-1)*60_000,
     bucketSeconds:60,activityIndex:35,metric:'ble_alias_activity'
    },signer,round);
    const published=await publishSynthetic(node,envelope);
    emit({event:'synthetic-published-no-ack',reportId:published.reportId,
     round,delivered:false,deliveryObserved:false,
     note:'Publisher cannot certify receipt: compare with independently captured observer log'});
    // A single GossipSub publish is lossy. Keep the peer alive briefly
    // to complete gossip processing, without inventing an ACK.
    await sleep(1000);
   }
  }
 }catch(e){
  console.error(JSON.stringify({event:'pilot-error',error:e instanceof Error?e.message:String(e),
   syntheticOnly:true,publicTestnetReady:false}));
  process.exitCode=1;
 }finally{
  observer?.close();
  if(node)await node.stop().catch(()=>{process.exitCode=1;});
 }
}
