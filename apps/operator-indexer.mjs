#!/usr/bin/env node
/**
 * Standalone, synthetic-only indexer runtime. Operator identities, approved
 * signer IDs, upstream peer address and allowed peers are supplied out of
 * band in a local, private config. No test-only shared coordination volume.
 */
import path from 'node:path';
import {readSyntheticIndexerConfig} from '../src/synthetic-indexer-config.mjs';
import {openPersistentPeerIdentity} from '../src/operator-identity.mjs';
import {createPrivateNode} from '../src/private-transport.mjs';
import {DurableRegionalIngest} from '../src/durable-ingest.mjs';
import {registerTrustedIndexerSync} from '../src/indexer-sync.mjs';
import {createTrustedIndexerReconciler} from '../src/indexer-reconciler.mjs';

const filename=process.argv[2];
if(!filename){
 console.error('Usage: node apps/operator-indexer.mjs <private-config.json>');
 process.exit(2);
}
const config=readSyntheticIndexerConfig(filename);
const identity=await openPersistentPeerIdentity(path.join(config.stateDir,'operator-identity'),
  {create:false});
const node=await createPrivateNode({
 listen:config.listen,allowPrivateLan:config.allowPrivateLan,
 privateKey:identity.privateKey
});
let index,service,reconciler,closed=false;
async function close(){
 if(closed)return;closed=true;
 reconciler?.stop();
 try{await service?.close();}catch{}
 await node.stop();
 try{index?.close();}catch{}
}
try{
 if(node.peerId.toString()!==identity.peerId)
  throw Error('Persistent operator Peer ID mismatch');
 if(config.trustedIndexerPeers.includes(identity.peerId))
  throw Error('Own Peer ID cannot be trusted upstream');
 index=new DurableRegionalIngest({
  dbPath:path.join(config.stateDir,'index.sqlite'),
  authorizedKeys:new Set(config.authorizedSigningKeys)
 });
 service=registerTrustedIndexerSync(node,{
  index,area:config.region,allowedPeers:new Set(config.trustedIndexerPeers),
  allowPrivateLan:config.allowPrivateLan
 });
 if(config.mode==='serve'){
  console.log(JSON.stringify({event:'ready',mode:'serve',synthetic:true,
   peerId:identity.peerId,region:config.region,
   address:node.getMultiaddrs().map(a=>a.toString())}));
  await new Promise(resolve=>{
   process.once('SIGINT',resolve);
   process.once('SIGTERM',resolve);
  });
 }else{
  reconciler=createTrustedIndexerReconciler({
   node,index,area:config.region,allowPrivateLan:config.allowPrivateLan,
   allowedSourcePeerIds:new Set([config.upstreamPeerId]),
   peerAddress:config.upstreamManifest.seedAddress,
   intervalMs:1000,pageSize:2,maxReportsPerRound:32,timeoutMs:1500
  });
  let final;
  for(let attempt=0;attempt<12;attempt++){
   final=await reconciler.runOnce();
   if(final.status==='consistent')break;
   await new Promise(resolve=>setTimeout(resolve,150));
  }
  console.log(JSON.stringify({event:'sync-result',mode:'sync-once',synthetic:true,
   peerId:identity.peerId,region:config.region,status:final?.status,
   accepted:index.stats().accepted,summary:index.signedArchiveSummary({area:config.region})}));
  if(final?.status!=='consistent')process.exitCode=1;
 }
}catch(error){
 console.error(error instanceof Error?error.message:String(error));
 process.exitCode=1;
}finally{await close();}
