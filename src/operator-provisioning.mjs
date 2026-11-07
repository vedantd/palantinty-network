import {lstatSync,readFileSync,writeFileSync,openSync,closeSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {parseTrustedIndexerSeed} from './private-lan-policy.mjs';

const AREA=/^[a-z0-9][a-z0-9._-]{2,63}$/;
const PEER=/^[A-Za-z0-9]{46,64}$/;
function exact(value,keys){
 return value&&typeof value==='object'&&!Array.isArray(value)&&
  Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
}

/** A manually authenticated out-of-band manifest is public identity data. */
export function operatorManifest({peerId,region,seedAddress}={}){
 if(typeof peerId!=='string'||!PEER.test(peerId)||
    typeof region!=='string'||!AREA.test(region)||
    typeof seedAddress!=='string')
  throw new Error('Invalid public operator manifest');
 const addr=parseTrustedIndexerSeed(seedAddress,{allowPrivateLan:true});
 if(seedAddress.split('/').at(-1)!==peerId)
  throw new Error('Manifest Peer ID differs from pinned address');
 return Object.freeze({schema:'palantiny.operator-manifest.v1',
   peerId,region,seedAddress});
}

/**
 * Refuse unverified manifests: sharing a JSON file is NOT authentication.
 * Operators must verify the Peer ID by a second, trusted channel and
 * explicitly pin it before the network client uses it.
 */
export function validatePinnedManifest(value,{expectedPeerId,region}={}){
 if(!exact(value,['schema','peerId','region','seedAddress'])||
    value.schema!=='palantiny.operator-manifest.v1')
  throw new Error('Invalid operator manifest schema');
 const manifest=operatorManifest(value);
 if(expectedPeerId!==manifest.peerId||region!==manifest.region)
  throw new Error('Unverified or mismatched operator Peer ID/region');
 return manifest;
}
export function readPinnedOperatorFile(filename,{expectedPeerId,region}={}){
 if(typeof filename!=='string'||!filename.trim())throw new TypeError('Operator config path required');
 const file=path.resolve(filename);
 const info=lstatSync(file);
 if(!info.isFile()||info.isSymbolicLink()||(info.mode&0o077)!==0)
  throw new Error('Operator config must be private regular file 0600');
 const buf=readFileSync(file);
 if(buf.length>4_096)throw new Error('Operator config exceeds size limit');
 return validatePinnedManifest(JSON.parse(buf.toString('utf8')),
   {expectedPeerId,region});
}
