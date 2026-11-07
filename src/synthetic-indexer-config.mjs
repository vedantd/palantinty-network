import {lstatSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {parseTrustedListen} from './private-lan-policy.mjs';
import {validatePinnedManifest} from './operator-provisioning.mjs';

const REGION=/^[a-z0-9][a-z0-9._-]{2,63}$/;
const SIGNER=/^[a-f0-9]{64}$/;
const PEER=/^[A-Za-z0-9]{46,64}$/;
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&
  Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));

/**
 * P01a fail-closed, operator-provisioned synthetic-only runtime config.
 * Every peer ID / region is pinned by a local operator, not learned from
 * a shared folder, public discovery response or unauthenticated network.
 */
export function validateSyntheticIndexerConfig(config){
 const keys=['schema','syntheticOnly','mode','region','stateDir','listen',
  'allowPrivateLan','authorizedSigningKeys','trustedIndexerPeers',
  'upstreamPeerId','upstreamManifest'];
 if(!exact(config,keys) ||
    config.schema!=='palantiny.synthetic-indexer-config.v1'||
    config.syntheticOnly!==true||!['serve','sync-once'].includes(config.mode)||
    typeof config.region!=='string'||!REGION.test(config.region)||
    typeof config.stateDir!=='string'||!path.isAbsolute(config.stateDir)||
    typeof config.listen!=='string'||typeof config.allowPrivateLan!=='boolean'||
    !Array.isArray(config.authorizedSigningKeys)||
    config.authorizedSigningKeys.length<1||config.authorizedSigningKeys.length>32||
    config.authorizedSigningKeys.some(k=>typeof k!=='string'||!SIGNER.test(k))||
    new Set(config.authorizedSigningKeys).size!==config.authorizedSigningKeys.length||
    !Array.isArray(config.trustedIndexerPeers)||
    config.trustedIndexerPeers.length<1||config.trustedIndexerPeers.length>16||
    config.trustedIndexerPeers.some(p=>typeof p!=='string'||!PEER.test(p))||
    new Set(config.trustedIndexerPeers).size!==config.trustedIndexerPeers.length)
   throw new Error('Invalid or non-synthetic operator indexer configuration');
 parseTrustedListen(config.listen,{allowPrivateLan:config.allowPrivateLan});
 if(config.mode==='serve'){
   if(config.upstreamPeerId!==null||config.upstreamManifest!==null)
     throw new Error('Serving node must not infer an upstream peer');
 }else{
   if(typeof config.upstreamPeerId!=='string'||!PEER.test(config.upstreamPeerId)||
      !config.trustedIndexerPeers.includes(config.upstreamPeerId))
     throw new Error('Explicitly pinned upstream peer required');
   validatePinnedManifest(config.upstreamManifest,{
     expectedPeerId:config.upstreamPeerId,region:config.region
   });
   if(!config.allowPrivateLan &&
      !config.upstreamManifest.seedAddress.startsWith('/ip4/127.0.0.1/'))
     throw new Error('Private LAN upstream requires explicit opt-in');
 }
 return Object.freeze({...config,
   authorizedSigningKeys:Object.freeze([...config.authorizedSigningKeys]),
   trustedIndexerPeers:Object.freeze([...config.trustedIndexerPeers])
 });
}

export function readSyntheticIndexerConfig(filename){
 if(typeof filename!=='string'||!filename.trim())throw new TypeError('Config file required');
 const stat=lstatSync(filename);
 if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)
   throw new Error('Config must be a private regular file 0600');
 const data=readFileSync(filename);
 if(data.byteLength>8192)throw new Error('Config exceeds 8 KiB');
 return validateSyntheticIndexerConfig(JSON.parse(data.toString('utf8')));
}
