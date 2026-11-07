#!/usr/bin/env node
/** Offline preflight for a single permissioned, synthetic-only operator. */
import path from 'node:path';
import {lstatSync} from 'node:fs';
import {readSyntheticIndexerConfig} from '../src/synthetic-indexer-config.mjs';
import {openPersistentPeerIdentity} from '../src/operator-identity.mjs';

const file=process.argv[2];
if(!file){
 console.error('Usage: npm run operator:preflight -- <private-config.json>');
 process.exitCode=2;
}else{
 try{
  const config=readSyntheticIndexerConfig(file);
  const info=lstatSync(config.stateDir);
  if(!info.isDirectory()||info.isSymbolicLink()||(info.mode&0o077)!==0)
   throw Error('Operator state directory must be private 0700');
  const identity=await openPersistentPeerIdentity(
   path.join(config.stateDir,'operator-identity'),{create:false});
  if(config.trustedIndexerPeers.includes(identity.peerId))
   throw Error('Own peer ID in remote trust list');
  if(config.mode==='sync-once'&&
     config.upstreamManifest.peerId===identity.peerId)
   throw Error('Indexer may not synchronize from itself');
  if(config.mode==='serve'&&config.listen.endsWith('/tcp/0'))
   throw Error('Serving node must advertise a fixed TCP port for remote operators');
  console.log(JSON.stringify({
   status:'operator-config-valid',syntheticOnly:true,peerId:identity.peerId,
   region:config.region,mode:config.mode,
   privateNetworkOnly:true,publicTestnetReady:false,
   note:'Local config preflight only. This does not prove network connectivity, security or real-data consent.'
  },null,2));
 }catch(e){
  console.error(e instanceof Error?e.message:String(e));
  process.exitCode=1;
 }
}
