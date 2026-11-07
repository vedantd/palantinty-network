#!/usr/bin/env node
/**
 * P02c-1 test-only Docker bridge drill. Never use the coordination directory
 * to establish operational trust: it exchanges PUBLIC test identities only.
 */
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {setTimeout as sleep} from 'node:timers/promises';
import {generateKeyPair} from '@libp2p/crypto/keys';
import {peerIdFromPrivateKey} from '@libp2p/peer-id';
import {openLocalIdentity} from '../src/identity.mjs';
import {signReport} from '../src/protocol.mjs';
import {createPinnedSyntheticGossipNode} from '../src/pinned-synthetic-node.mjs';
import {observeSyntheticTopic,publishSynthetic,syntheticTopic} from '../src/synthetic-testnet.mjs';

const role=process.argv[2],area='synthetic-private-overlay-ci',coord='/coord';
const peers={observer:'172.28.90.10',publisher:'172.28.90.11'};
if(!Object.hasOwn(peers,role))throw Error('Only test observer or publisher role allowed');
const other=role==='observer'?'publisher':'observer';
mkdirSync(coord,{recursive:true});
const key=await generateKeyPair('Ed25519');
const id=peerIdFromPrivateKey(key).toString();
writeFileSync(coord+'/'+role+'.json',JSON.stringify({peerId:id,ip:peers[role]}),{flag:'wx',mode:0o600});
async function until(check,label,timeoutMs=20_000){
 const deadline=Date.now()+timeoutMs;
 while(Date.now()<deadline){
  const value=check();
  if(value)return value;
  await sleep(80);
 }
 throw Error('Timed out: '+label);
}
const counterparty=await until(()=>{
 if(!existsSync(coord+'/'+other+'.json'))return null;
 try{return JSON.parse(readFileSync(coord+'/'+other+'.json','utf8'));}catch{return null;}
},'counterparty public test manifest');
if(counterparty.ip!==peers[other]||typeof counterparty.peerId!=='string')
 throw Error('Unexpected test-only counterpart manifest');
const port=40123;
const node=await createPinnedSyntheticGossipNode({
 privateKey:key,allowedPeerIds:[counterparty.peerId],allowPrivateLan:true,
 allowedRemoteIps:[counterparty.ip],listen:'/ip4/'+peers[role]+'/tcp/'+port
});
let observer;
try{
 if(role==='observer'){
  const accepted=[];
  observer=observeSyntheticTopic(node,{area,onSynthetic:v=>accepted.push(v)});
  writeFileSync(coord+'/observer-ready',String(node.peerId),{flag:'wx'});
  await until(()=>accepted.length===1,'one signed synthetic report');
  if(accepted.some(v=>!v.syntheticOnly||Object.hasOwn(v,'envelope')))
   throw Error('Signed material leaked from sanitized observer');
  console.log(JSON.stringify({role,syntheticOnly:true,privateNetworkOnly:true,
   peerId:id,accepted:accepted.length,area,realSensorData:false,
   publicParticipation:false}));
 }else{
  await until(()=>existsSync(coord+'/observer-ready'),'observer ready marker');
  const addr='/ip4/'+peers.observer+'/tcp/'+port+'/p2p/'+counterparty.peerId;
  await node.dial(addr,{signal:AbortSignal.timeout(10_000)});
  const topic=syntheticTopic(area);
  await until(()=>node.services.pubsub.getSubscribers(topic).some(
    peer=>peer.toString()===counterparty.peerId),'remote subscriber');
  await sleep(1200);
  const signer=openLocalIdentity('/tmp/synthetic-fixture-signer');
  const payload=signReport({schema:'pulsemesh.activity.v1',area,
   bucketStart:Date.UTC(2026,10,6,20),bucketSeconds:60,
   activityIndex:35,metric:'ble_alias_activity'},signer,1);
  await publishSynthetic(node,payload);
  console.log(JSON.stringify({role,syntheticOnly:true,privateNetworkOnly:true,
   peerId:id,published:1,area,realSensorData:false,
   publicParticipation:false}));
 }
}finally{
 observer?.close();
 await node.stop();
}
