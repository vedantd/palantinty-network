#!/usr/bin/env node
/**
 * Explicitly generate SYNTHETIC signed activity fixtures for the P01 operator
 * pilot. Never reads BLE input. Refuses a pre-existing index database to
 * prevent mixing fixtures into an operator's historical data.
 */
import {existsSync,lstatSync} from 'node:fs';
import path from 'node:path';
import {openLocalIdentity} from '../src/identity.mjs';
import {signReport} from '../src/protocol.mjs';
import {DurableRegionalIngest} from '../src/durable-ingest.mjs';
const [stateDir,region]=process.argv.slice(2);
if(!stateDir||!region){
 console.error('Usage: npm run operator:seed -- <private-absolute-state-dir> <synthetic-region>');
 process.exitCode=2;
}else{
 try{
  if(!path.isAbsolute(stateDir)||!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(region)||
     !region.startsWith('synthetic-'))throw Error('Explicit absolute state directory and synthetic-prefixed region required');
  const info=lstatSync(stateDir);
  if(!info.isDirectory()||info.isSymbolicLink()||(info.mode&0o077)!==0)
   throw Error('Fixture state directory must be 0700 and private');
  const dbPath=path.join(stateDir,'index.sqlite');
  if(existsSync(dbPath))throw Error('Refusing to seed an existing index database');
  const signers=[0,1].map(i=>openLocalIdentity(path.join(stateDir,'synthetic-signer-'+i)));
  const keys=new Set(signers.map(s=>s.keyId));
  const index=new DurableRegionalIngest({dbPath,authorizedKeys:keys});
  try{
   const base=Math.floor((Date.now()-35*60_000)/60_000)*60_000;
   for(let window=0;window<3;window++){
    for(const [i,key] of signers.entries()){
     const env=signReport({schema:'pulsemesh.activity.v1',area:region,
      bucketStart:base+window*60_000,bucketSeconds:60,
      activityIndex:20+10*i+window*5,metric:'ble_alias_activity'
     },key,window+1);
     if(index.ingest(env).accepted!==true)throw Error('Synthetic fixture ingest failed');
    }
   }
   console.log(JSON.stringify({
    syntheticOnly:true,region,accepted:index.stats().accepted,
    authorizedSigningKeys:[...keys],
    note:'Share only the public signer key IDs; private keys stay in this local fixture directory.'
   },null,2));
  }finally{index.close();}
 }catch(error){
  console.error(error instanceof Error?error.message:String(error));
  process.exitCode=1;
 }
}
