import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {lstatSync,readFileSync,openSync,closeSync,writeFileSync,
  renameSync,unlinkSync,fsyncSync} from 'node:fs';
import {assertPrivatePilotDir} from './p02c-pilot-operations.mjs';
import {isTrustedAddressIp} from './private-lan-policy.mjs';
import {validatePinnedSyntheticSeed} from './synthetic-network-policy.mjs';

/**
 * P03a: operator-local proposed/approved/revoked pinned-peer directory.
 * Explicit out-of-band approval is an operator assertion, NOT cryptographic
 * enrollment, remote policy or permissionless identity.
 */
const SCHEMA='palantiny.private-peer-enrollment.v1';
const PEER=/^[1-9A-HJ-NP-Za-km-z]{40,128}$/;
const PILOT=/^[a-z0-9][a-z0-9-]{4,47}$/;
const STATES=new Set(['candidate','approved','revoked']);
const KEYS=['peerId','remoteIp','seedAddress','state','proposedAt','approvedAt','revokedAt'];
const exact=(x,fields)=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 Object.keys(x).length===fields.length&&fields.every(field=>Object.hasOwn(x,field));
const ledgerPath=d=>path.join(d,'P03_PRIVATE_PEERS.json');
const lockPath=d=>path.join(d,'.P03_PRIVATE_PEERS.lock');
function validEntry(e){
 if(!exact(e,KEYS)||!PEER.test(e.peerId)||
   !isTrustedAddressIp(e.remoteIp,{allowPrivateLan:true})||
   typeof e.seedAddress!=='string'||!STATES.has(e.state)||
   typeof e.proposedAt!=='string'||
   (e.approvedAt!==null&&typeof e.approvedAt!=='string')||
   (e.revokedAt!==null&&typeof e.revokedAt!=='string')||
   (e.state==='candidate'&&(e.approvedAt!==null||e.revokedAt!==null))||
   (e.state==='approved'&&(e.approvedAt===null||e.revokedAt!==null))||
   (e.state==='revoked'&&e.revokedAt===null))
  throw Error('Invalid private peer enrollment entry');
 const loop=e.remoteIp==='127.0.0.1';
 validatePinnedSyntheticSeed(e.seedAddress,{
  allowedPeerIds:[e.peerId],allowPrivateLan:!loop,
  allowedRemoteIps:loop?[]:[e.remoteIp]
 });
 if(!e.seedAddress.startsWith('/ip4/'+e.remoteIp+'/tcp/'))
  throw Error('Pinned enrollment IP mismatch');
}
function validLedger(data,pilotId){
 if(!exact(data,['schema','pilotId','revision','entries'])||
   data.schema!==SCHEMA||data.pilotId!==pilotId||
   !Number.isSafeInteger(data.revision)||data.revision<0||
   !Array.isArray(data.entries)||data.entries.length>128)
  throw Error('Invalid private peer enrollment ledger');
 const ids=new Set();let approved=0;
 for(const e of data.entries){
  validEntry(e);
  if(ids.has(e.peerId))throw Error('Duplicate Peer ID in local enrollment ledger');
  ids.add(e.peerId);
  if(e.state==='approved')approved++;
 }
 if(approved>16)throw Error('Too many approved pinned peers');
 return data;
}
function load(directory,pilotId,{allowMissing=false}={}){
 assertPrivatePilotDir(directory);
 if(typeof pilotId!=='string'||!PILOT.test(pilotId))
  throw Error('Valid pilot identifier required');
 let st;
 try{st=lstatSync(ledgerPath(directory));}
 catch(e){
  if(e.code==='ENOENT'&&allowMissing)return null;
  throw e;
 }
 if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0||
   st.size===0||st.size>65536)
  throw Error('Unsafe private peer enrollment file (requires 0600 regular file)');
 return validLedger(JSON.parse(readFileSync(ledgerPath(directory),'utf8')),pilotId);
}
export function readPrivatePeerLedger(directory,pilotId){
 const d=load(directory,pilotId);
 return structuredClone(d);
}
function lock(directory,fn){
 assertPrivatePilotDir(directory);
 const p=lockPath(directory);
 // Exclusive lock: concurrent writers fail closed, never overwrite lock.
 const fd=openSync(p,'wx',0o600);
 try{return fn();}
 finally{closeSync(fd);unlinkSync(p);}
}
/** A durable rename requires syncing the directory entry, not only the temp file. */
function syncDirectory(directory){
 const fd=openSync(directory,'r');
 try{fsyncSync(fd);}finally{closeSync(fd);}
}
function save(directory,data){
 const dest=ledgerPath(directory);
 // Refuse symlinks and unsafe files on every mutation.
 try{
  const s=lstatSync(dest);
  if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o077)!==0)
   throw Error('Unsafe existing enrollment file');
 }catch(e){if(e.code!=='ENOENT')throw e;}
 const temp=path.join(directory,'.p03-'+randomBytes(12).toString('hex')+'.tmp');
 let written=false;
 try{
  const fd=openSync(temp,'wx',0o600);
  try{writeFileSync(fd,JSON.stringify(data,null,2)+'\n');fsyncSync(fd);}
  finally{closeSync(fd);}
  renameSync(temp,dest);
  written=true;
  // A successful rename is atomic, but without this fsync it may be lost
  // after a power failure. If fsync fails, report an ambiguous commit:
  // the caller must re-read and investigate rather than blindly retry.
  syncDirectory(directory);
 }finally{
  if(!written)try{unlinkSync(temp);}catch{}
 }
}
export function initializePeerLedger(directory,pilotId){
 return lock(directory,()=>{
  if(load(directory,pilotId,{allowMissing:true})!==null)
   throw Error('Peer enrollment ledger already initialized');
  const data={schema:SCHEMA,pilotId,revision:0,entries:[]};
  validLedger(data,pilotId);
  save(directory,data);
  return structuredClone(data);
 });
}
function mutate(directory,pilotId,change,{expectedRevision}={}){
 if(expectedRevision!==undefined&&
   (!Number.isSafeInteger(expectedRevision)||expectedRevision<0))
  throw Error('Expected revision must be a nonnegative safe integer');
 return lock(directory,()=>{
  const data=load(directory,pilotId);
  if(expectedRevision!==undefined&&data.revision!==expectedRevision)
   throw Error('Stale peer enrollment revision');
  if(data.revision===Number.MAX_SAFE_INTEGER)
   throw Error('Peer enrollment revision exhausted');
  const next=change(structuredClone(data));
  next.revision=data.revision+1;
  validLedger(next,pilotId);
  save(directory,next);
  return structuredClone(next);
 });
}
export function proposePrivatePeer(directory,pilotId,{peerId,remoteIp,seedAddress,expectedRevision}={}){
 return mutate(directory,pilotId,data=>{
  if(data.entries.some(e=>e.peerId===peerId))
   throw Error('Peer ID already exists or is permanently revoked in this ledger');
  if(data.entries.length>=128)throw Error('Enrollment ledger is full');
  const candidate={peerId,remoteIp,seedAddress,state:'candidate',
   proposedAt:new Date().toISOString(),approvedAt:null,revokedAt:null};
  validEntry(candidate);
  data.entries.push(candidate);
  return data;
 },{expectedRevision});
}
export function approvePrivatePeer(directory,pilotId,peerId,{verifiedOutOfBand=false,expectedRevision}={}){
 if(verifiedOutOfBand!==true)throw Error('Explicit independent identity verification required');
 return mutate(directory,pilotId,data=>{
  const e=data.entries.find(e=>e.peerId===peerId);
  if(!e||e.state!=='candidate')throw Error('Only unapproved candidates can be approved');
  e.state='approved';e.approvedAt=new Date().toISOString();
  return data;
 },{expectedRevision});
}
export function revokePrivatePeer(directory,pilotId,peerId,{expectedRevision}={}){
 return mutate(directory,pilotId,data=>{
  const e=data.entries.find(e=>e.peerId===peerId);
  if(!e||e.state==='revoked')throw Error('Only existing active peers can be revoked');
  e.state='revoked';e.revokedAt=new Date().toISOString();
  return data;
 },{expectedRevision});
}
/**
 * H02b: prepare one replacement in a single durable, revision-checked write.
 *
 * No implicit approval: the replacement is only a candidate, and must be
 * independently verified, explicitly approved, then staged for a manual
 * restart. The old Peer ID remains a terminal revoked tombstone.
 */
export function rotatePrivatePeer(directory,pilotId,{
 oldPeerId,newPeerId,remoteIp,seedAddress,expectedRevision
}={}){
 if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)
  throw Error('Rotation requires an explicitly reviewed ledger revision');
 if(oldPeerId===newPeerId)
  throw Error('Rotation requires a distinct replacement Peer ID');
 return mutate(directory,pilotId,data=>{
  const old=data.entries.find(e=>e.peerId===oldPeerId);
  if(!old||old.state!=='approved')
   throw Error('Only an approved existing peer can be rotated');
  if(data.entries.some(e=>e.peerId===newPeerId))
   throw Error('Replacement Peer ID already exists, including revoked tombstones');
  if(data.entries.length>=128)
   throw Error('Enrollment ledger is full; tombstones must be preserved');
  const candidate={
   peerId:newPeerId,remoteIp,seedAddress,state:'candidate',
   proposedAt:new Date().toISOString(),approvedAt:null,revokedAt:null
  };
  validEntry(candidate);
  old.state='revoked';
  old.revokedAt=new Date().toISOString();
  data.entries.push(candidate);
  return data;
 },{expectedRevision});
}

export function approvedPrivatePeers(directory,pilotId){
 const data=readPrivatePeerLedger(directory,pilotId);
 return Object.freeze({
  schema:'palantiny.private-peer-pins.v1',
  pilotId,revision:data.revision,syntheticOnly:true,
  peers:data.entries.filter(e=>e.state==='approved').map(e=>Object.freeze({
   peerId:e.peerId,remoteIp:e.remoteIp,seedAddress:e.seedAddress
  }))
 });
}
