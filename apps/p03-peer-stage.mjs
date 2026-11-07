#!/usr/bin/env node
/** Offline peer staging, never an automatic trust update. */
import {stagePrivatePilotPeer} from '../src/p03-peer-staging.mjs';

const [configPath,peerId,revision,outputPath,...extra]=process.argv.slice(2);
if(!configPath||!peerId||!revision||!outputPath||extra.length||
   !/^[0-9]{1,9}$/.test(revision)){
 console.error('Usage: node apps/p03-peer-stage.mjs <active-private-config.json> <approved-peer-id> <expected-ledger-revision> <new-private-config.json>');
 process.exitCode=2;
}else{
 try{
  console.log(JSON.stringify(await stagePrivatePilotPeer({
   configPath,peerId,expectedRevision:Number(revision),outputPath
  }),null,2));
 }catch(error){
  console.error(error instanceof Error?error.message:String(error));
  process.exitCode=1;
 }
}
