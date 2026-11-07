#!/usr/bin/env node
import {openPersistentPeerIdentity} from '../src/operator-identity.mjs';
const directory=process.argv[2];
if(!directory){
 console.error('Usage: node apps/operator-identity.mjs <private-operator-directory>');
 process.exitCode=2;
}else{
 const {peerId,keyFile}=await openPersistentPeerIdentity(directory);
 console.log(JSON.stringify({peerId,keyFile,
  note:'Private key stays on this machine. Verify the Peer ID out of band before adding it to a peer allowlist.'},null,2));
}
