#!/usr/bin/env node
/**
 * M10: source or replica process on two separate private Docker network hosts.
 * Coordination volume exchanges ONLY public bootstrap metadata, never signed
 * observation data or private keys. All reports are synthetic.
 */
import {networkInterfaces} from 'node:os';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,renameSync,existsSync} from 'node:fs';
import path from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {openLocalIdentity} from '../src/identity.mjs';
import {signReport} from '../src/protocol.mjs';
import {createPrivateNode} from '../src/private-transport.mjs';
import {openPersistentPeerIdentity} from '../src/operator-identity.mjs';
import {DurableRegionalIngest} from '../src/durable-ingest.mjs';
import {registerTrustedIndexerSync} from '../src/indexer-sync.mjs';
import {createTrustedIndexerReconciler} from '../src/indexer-reconciler.mjs';
import {isTrustedAddressIp} from '../src/private-lan-policy.mjs';

const area='synthetic-m10-private-pilot',now=Date.UTC(2026,10,6,20);
const role=process.env.PALANTINY_M10_ROLE;
if(!['source','replica'].includes(role))throw Error('PALANTINY_M10_ROLE must be source or replica');
const coord='/coord',state='/state';
mkdirSync(coord,{recursive:true});
mkdirSync(state,{recursive:true,mode:0o700});
const getIp=()=>{
 for(const entries of Object.values(networkInterfaces())){
  for(const it of entries??[]){
   if(it.family==='IPv4'&&!it.internal&&isTrustedAddressIp(it.address,{allowPrivateLan:true}))
    return it.address;
  }
 }
 throw Error('No explicit RFC1918 IPv4 interface available; refusing public interface');
};
const ip=getIp();
const storeFile=(name,content)=>{
 const file=path.join(coord,name);
 const tmp=file+'.tmp-'+role;
 writeFileSync(tmp,JSON.stringify(content),{mode:0o600});
 renameSync(tmp,file);
};
const getFile=name=>{
 const p=path.join(coord,name);
 if(!existsSync(p))return null;
 return JSON.parse(readFileSync(p,'utf8'));
};
const until=async(fn,description,timeoutMs=30_000)=>{
 const deadline=Date.now()+timeoutMs;
 while(Date.now()<deadline){const value=fn();if(value)return value;await sleep(90);}
 throw Error('Timed out: '+description);
};
const operatorIdentity=await openPersistentPeerIdentity(path.join(state,'node-identity'));
const node=await createPrivateNode({
 listen:'/ip4/'+ip+'/tcp/0',allowPrivateLan:true,
 privateKey:operatorIdentity.privateKey
});
if(node.peerId.toString()!==operatorIdentity.peerId)
 throw Error('Persistent operator identity mismatch');
const addr=node.getMultiaddrs()[0].toString();
const address=addr.includes('/p2p/')?addr:addr+'/p2p/'+node.peerId.toString();
const indexes=[];
let service,reconciler;
try{
 if(role==='source'){
  const keys=[0,1].map(i=>openLocalIdentity(path.join(state,'contributor-'+i)));
  const index=new DurableRegionalIngest({
   dbPath:path.join(state,'source.sqlite'),
   authorizedKeys:new Set(keys.map(key=>key.keyId)),now:()=>now
  });
  indexes.push(index);
  for(let sequence=1;sequence<=4;sequence++){
   for(const [i,key] of keys.entries()){
    const env=signReport({schema:'pulsemesh.activity.v1',area,
      bucketStart:now-(27-sequence)*60_000,bucketSeconds:60,
      activityIndex:i?35:25,metric:'ble_alias_activity'},key,sequence);
    if(!index.ingest(env).ack)throw Error('Failed synthetic source setup');
   }
  }
  storeFile('source.json',{address,keyIds:keys.map(x=>x.keyId),area});
  const peerId=await until(()=>getFile('replica.json')?.peerId,'replica public Peer ID');
  service=registerTrustedIndexerSync(node,{
   index,area,allowPrivateLan:true,allowedPeers:new Set([peerId])
  });
  await until(()=>getFile('result.json')?.converged===true,'replica independent index convergence');
  console.log(JSON.stringify({role,privateIp:ip,accepted:index.stats().accepted,
   trustedReplica:peerId,synthetic:true,converged:true}));
 }else{
  const manifest=await until(()=>getFile('source.json'),'source public bootstrap manifest');
  if(manifest.area!==area||!Array.isArray(manifest.keyIds)||manifest.keyIds.length!==2)
   throw Error('Invalid source bootstrap manifest');
  const index=new DurableRegionalIngest({
   dbPath:path.join(state,'replica.sqlite'),
   authorizedKeys:new Set(manifest.keyIds),now:()=>now
  });
  indexes.push(index);
  storeFile('replica.json',{peerId:node.peerId.toString()});
  reconciler=createTrustedIndexerReconciler({
   node,index,peerAddress:manifest.address,area,allowPrivateLan:true,
   allowedSourcePeerIds:new Set([manifest.address.split('/').at(-1)]),
   intervalMs:150,pageSize:2,maxReportsPerRound:3,timeoutMs:1000
  });
  reconciler.start();
  await until(()=>index.stats().accepted===8&&reconciler.stats().agreements>=1,
   'replicated signed reports and matching source digest');
  reconciler.stop();
  const stats=reconciler.stats();
  storeFile('result.json',{converged:true,accepted:index.stats().accepted,
    sourcePeer:manifest.address.split('/').at(-1)});
  console.log(JSON.stringify({role,privateIp:ip,accepted:index.stats().accepted,
   syncRounds:stats.rounds,agreements:stats.agreements,synthetic:true,converged:true}));
 }
}finally{
 reconciler?.stop();
 try{await service?.close()}catch{}
 await node.stop();
 for(const index of indexes.reverse())try{index.close()}catch{}
}
