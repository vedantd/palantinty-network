import {publicKeyToProtobuf,publicKeyFromProtobuf} from '@libp2p/crypto/keys';
import {peerIdFromPublicKey} from '@libp2p/peer-id';
import {canonicalCoverage} from './private-coverage-advert.mjs';
import {parseSyntheticRegionKey} from './private-synthetic-region.mjs';

const PREFIX=new TextEncoder().encode('palantiny.private-indexer-coverage.peer-bound.v1\0');
const FIELDS=['payload','publicKey','signature'];
const MAX_PUBLIC_KEY=512;
const MAX_ADVERT_BYTES=4096;
const exact=(value,fields)=>value!==null&&typeof value==='object'&&
 !Array.isArray(value)&&Object.keys(value).length===fields.length&&
 fields.every(k=>Object.hasOwn(value,k));
function canonicalB64(s,maxBytes){
 if(typeof s!=='string'||!s.length||s.length>Math.ceil(maxBytes/3)*4+4||
   !/^[a-zA-Z0-9+/]+={0,2}$/.test(s))
  throw new Error('Invalid canonical base64');
 const bytes=Buffer.from(s,'base64');
 if(bytes.length===0||bytes.length>maxBytes||bytes.toString('base64')!==s)
  throw new Error('Invalid canonical base64 encoding');
 return bytes;
}
function signedBytes(payload,now){
 const bytes=canonicalCoverage(payload,now);
 for(const key of payload.regions)parseSyntheticRegionKey(key);
 const result=new Uint8Array(PREFIX.length+bytes.length);
 result.set(PREFIX);
 result.set(bytes,PREFIX.length);
 return result;
}

/**
 * D01b private fictional-region coverage with the *same libp2p key* as the
 * Noise-authenticated node. Unlike offline D01 adverts, no separate trust
 * map silently asserts that an unrelated Ed25519 key owns a Peer ID.
 */
export async function signPeerBoundCoverage(payload,privateKey,now=Date.now()){
 if(privateKey?.type!=='Ed25519'||!privateKey.publicKey)
  throw new TypeError('Ed25519 libp2p private identity required');
 if(peerIdFromPublicKey(privateKey.publicKey).toString()!==payload?.peerId)
  throw new Error('Advertised peer ID does not match private libp2p identity');
 const bytes=signedBytes(payload,now);
 const publicKey=Buffer.from(publicKeyToProtobuf(privateKey.publicKey)).toString('base64');
 const signature=Buffer.from(await privateKey.sign(bytes)).toString('base64');
 const advert={payload,publicKey,signature};
 if(Buffer.byteLength(JSON.stringify(advert))>MAX_ADVERT_BYTES)
  throw new Error('Private coverage advertisement too large');
 return advert;
}

/**
 * Verification needs BOTH the actual authenticated remote Peer ID and an
 * operator-reviewed local allowlist. DHT provider records are untrusted hints.
 */
export async function verifyPeerBoundCoverage(advert,{
 expectedPeerId,approvedPeerIds,region,now=Date.now()
}={}){
 try{
  if(!exact(advert,FIELDS)||!(approvedPeerIds instanceof Set)||
     typeof expectedPeerId!=='string'||!approvedPeerIds.has(expectedPeerId)||
     typeof region!=='string'||Buffer.byteLength(JSON.stringify(advert))>MAX_ADVERT_BYTES)
   return false;
  const data=signedBytes(advert.payload,now);
  if(advert.payload.peerId!==expectedPeerId||
     !advert.payload.regions.includes(region))
   return false;
  parseSyntheticRegionKey(region);
  const publicKey=publicKeyFromProtobuf(canonicalB64(advert.publicKey,MAX_PUBLIC_KEY));
  if(publicKey?.type!=='Ed25519'||peerIdFromPublicKey(publicKey).toString()!==expectedPeerId)
   return false;
  const signature=canonicalB64(advert.signature,64);
  if(signature.length!==64)return false;
  return await publicKey.verify(data,signature)===true;
 }catch{return false;}
}
