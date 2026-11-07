#!/usr/bin/env node
/** P02c-3 local-only operator action; never a remote administrative service. */
import {readP02cHostConfig} from '../src/p02c-host-config.mjs';
import {disablePilot,resumePilot,isPilotDisabled} from '../src/p02c-pilot-operations.mjs';
const [action,file,...extra]=process.argv.slice(2);
if(!['status','stop','revoke','resume'].includes(action)||!file||
 (action==='revoke'&&extra.length!==1)||
 (action==='resume'&&(extra.length!==1||extra[0]!=='--reviewed'))||
 (['status','stop'].includes(action)&&extra.length!==0)){
 console.error('Usage: node apps/p02c-pilot-control.mjs <status|stop|revoke|resume> <private-config.json> [remote-peer-id|--reviewed]');
 process.exitCode=2;
}else{
 try{
  const config=readP02cHostConfig(file);
  let result;
  if(action==='status')result={disabled:isPilotDisabled(config.stateDir)};
  if(action==='stop')result=disablePilot(config.stateDir);
  if(action==='revoke'){
   if(extra[0]!==config.remotePeerId)
    throw Error('Revocation must match currently pinned remote Peer ID');
   result=disablePilot(config.stateDir,{reason:'peer-revoked',revokedPeerId:extra[0]});
  }
  if(action==='resume')result=resumePilot(config.stateDir,{
   configuredPeerId:config.remotePeerId,manualReview:true});
  console.log(JSON.stringify({schema:'palantiny.p02c-operator-control.v1',
   action,syntheticOnly:true,publicTestnetReady:false,...result}));
 }catch(error){
  console.error(error instanceof Error?error.message:String(error));
  process.exitCode=1;
 }
}
