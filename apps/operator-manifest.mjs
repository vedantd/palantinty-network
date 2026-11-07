#!/usr/bin/env node
/**
 * Produce the operator's public peer manifest entirely from locally held
 * persistent identity and explicitly configured private listener.
 * This output contains no signing keys or synthetic observations.
 *
 * The receiver must independently authenticate and pin this manifest;
 * receipt of a manifest alone is not sufficient to establish trust.
 */
import path from 'node:path';
import {readSyntheticIndexerConfig} from '../src/synthetic-indexer-config.mjs';
import {openPersistentPeerIdentity} from '../src/operator-identity.mjs';
import {operatorManifest} from '../src/operator-provisioning.mjs';

const configPath=process.argv[2];
if(!configPath){
 console.error('Usage: npm run operator:manifest -- <private-config.json>');
 process.exitCode=2;
}else{
 try{
  const config=readSyntheticIndexerConfig(configPath);
  const identity=await openPersistentPeerIdentity(
   path.join(config.stateDir,'operator-identity'),{create:false});
  const listen=config.listen;
  if(listen.endsWith('/tcp/0'))throw Error('Advertised listener must use a fixed TCP port');
  const manifest=operatorManifest({
   peerId:identity.peerId,region:config.region,
   seedAddress:listen+'/p2p/'+identity.peerId
  });
  console.log(JSON.stringify(manifest,null,2));
 }catch(error){
  console.error(error instanceof Error?error.message:String(error));
  process.exitCode=1;
 }
}
