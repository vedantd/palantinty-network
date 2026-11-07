#!/usr/bin/env node
/**
 * P03a offline, operator-local, default-deny peer lifecycle preparation.
 * This command does not contact a peer or configure a running libp2p node.
 */
import {readP02cHostConfig} from '../src/p02c-host-config.mjs';
import {
 initializePeerLedger,readPrivatePeerLedger,proposePrivatePeer,
 approvePrivatePeer,revokePrivatePeer,approvedPrivatePeers
} from '../src/p03-private-peer-ledger.mjs';

const [action,filename,...args]=process.argv.slice(2);
const USAGE='Usage: node apps/p03-peer-enrollment.mjs <init|list|propose|approve|revoke|pins> <private-host-config.json> [peerId ip seed | peerId --verified-out-of-band | peerId]';
if(!['init','list','propose','approve','revoke','pins'].includes(action)||!filename){
 console.error(USAGE);process.exitCode=2;
}else{
 try{
  const conf=readP02cHostConfig(filename);
  const d=conf.stateDir,p=conf.pilotId;
  let result;
  switch(action){
   case 'init':
    if(args.length)throw Error(USAGE);
    result=initializePeerLedger(d,p);break;
   case 'list':
    if(args.length)throw Error(USAGE);
    result=readPrivatePeerLedger(d,p);break;
   case 'pins':
    if(args.length)throw Error(USAGE);
    result=approvedPrivatePeers(d,p);break;
   case 'propose':
    if(args.length!==3)throw Error(USAGE);
    result=proposePrivatePeer(d,p,{peerId:args[0],remoteIp:args[1],seedAddress:args[2]});break;
   case 'approve':
    if(args.length!==2||args[1]!=='--verified-out-of-band')throw Error(USAGE);
    result=approvePrivatePeer(d,p,args[0],{verifiedOutOfBand:true});break;
   case 'revoke':
    if(args.length!==1)throw Error(USAGE);
    result=revokePrivatePeer(d,p,args[0]);break;
  }
  console.log(JSON.stringify({...result,publicTestnetReady:false,syntheticOnly:true},null,2));
 }catch(error){
  console.error(error instanceof Error?error.message:String(error));process.exitCode=1;
 }
}
