import {isTrustedAddressIp} from './private-lan-policy.mjs';

/**
 * P02c-1 restricted private-overlay synthetic transport policy.
 * Default is still only IPv4 loopback. Private-LAN opt-in requires an
 * explicit list of remote IPs AND independently pinned Noise peer IDs.
 * No DNS, public address, wildcard or libp2p relay is accepted.
 */
const PEER_ID=/^[1-9A-HJ-NP-Za-km-z]{40,128}$/;
const ADDRESS=/^\/ip4\/([^/]+)\/tcp\/([1-9][0-9]{0,4})(?:\/p2p\/([1-9A-HJ-NP-Za-km-z]{40,128}))?$/;

function concreteTcp(address){
 const value=typeof address==='string'?address:address?.toString?.();
 const match=typeof value==='string'&&ADDRESS.exec(value);
 if(!match||Number(match[2])>65535)return null;
 return {ip:match[1],port:Number(match[2]),peerId:match[3]??null};
}
export function isSandboxLoopbackTcp(address){
 return concreteTcp(address)?.ip==='127.0.0.1';
}
export function isAllowedSyntheticTcpAddress(address,{
 allowPrivateLan=false,allowedRemoteIps=[]
}={}){
 const target=concreteTcp(address);
 if(!target)return false;
 if(target.ip==='127.0.0.1')return true;
 return allowPrivateLan&&allowedRemoteIps.includes(target.ip)&&
  isTrustedAddressIp(target.ip,{allowPrivateLan:true});
}

/**
 * Peer ID is separately verified out of band. A seed address is not itself
 * an authenticity proof, even if it includes a /p2p/ suffix.
 */
export function validatePinnedSyntheticSeed(address,{
 allowedPeerIds,allowPrivateLan=false,allowedRemoteIps=[]
}={}){
 const target=concreteTcp(address);
 if(!target?.peerId||!Array.isArray(allowedPeerIds)||
    !allowedPeerIds.includes(target.peerId)||
    !isAllowedSyntheticTcpAddress(address,{allowPrivateLan,allowedRemoteIps}))
  throw new Error('Synthetic seed requires an allowed private address and pinned Peer ID');
 return Object.freeze({peerId:target.peerId,address});
}

export function sandboxSyntheticTransportPolicy({
 allowedPeerIds,allowPrivateLan=false,allowedRemoteIps=[]
}={}){
 if(!Array.isArray(allowedPeerIds)||allowedPeerIds.length<1||
    allowedPeerIds.length>16||allowedPeerIds.some(
     id=>typeof id!=='string'||!PEER_ID.test(id))||
    new Set(allowedPeerIds).size!==allowedPeerIds.length)
  throw Error('Explicit nonempty, unique authenticated PeerId allowlist required (max 16)');
 if(typeof allowPrivateLan!=='boolean'||!Array.isArray(allowedRemoteIps)||
    allowedRemoteIps.length>16||new Set(allowedRemoteIps).size!==allowedRemoteIps.length||
    (allowPrivateLan&&allowedRemoteIps.length===0)||
    (!allowPrivateLan&&allowedRemoteIps.length!==0)||
    allowedRemoteIps.some(ip=>typeof ip!=='string'||ip==='127.0.0.1'||
      !isTrustedAddressIp(ip,{allowPrivateLan:true})))
  throw new Error('Explicit unique RFC1918 remote IP allowlist required for private overlay');
 const allowed=new Set(allowedPeerIds);
 const params={allowPrivateLan,allowedRemoteIps:[...allowedRemoteIps]};
 const trusted=peer=>allowed.has(peer?.toString?.()??'');
 const addressAllowed=addr=>isAllowedSyntheticTcpAddress(addr,params);
 const permitted=(peer,connection)=>trusted(peer)&&
  addressAllowed(connection?.remoteAddr);
 const gater=Object.freeze({
  denyDialPeer:peer=>!trusted(peer),
  denyDialMultiaddr:addr=>!addressAllowed(addr),
  filterMultiaddrForPeer:(peer,addr)=>trusted(peer)&&addressAllowed(addr),
  denyInboundConnection:connection=>!addressAllowed(connection?.remoteAddr),
  denyOutboundConnection:(peer,connection)=>!permitted(peer,connection),
  denyInboundEncryptedConnection:(peer,connection)=>!permitted(peer,connection),
  denyOutboundEncryptedConnection:(peer,connection)=>!permitted(peer,connection),
  denyInboundUpgradedConnection:(peer,connection)=>!permitted(peer,connection),
  denyOutboundUpgradedConnection:(peer,connection)=>!permitted(peer,connection),
  denyInboundRelayReservation:()=>true,
  denyOutboundRelayedConnection:()=>true,
  denyInboundRelayedConnection:()=>true
 });
 return Object.freeze({
  connectionGater:gater,
  connectionManager:Object.freeze({
   maxConnections:8,
   maxIncomingPendingConnections:2,
   inboundConnectionThreshold:3,
   maxParallelDials:2,
   maxDialQueueLength:8,
   maxPeerAddrsToDial:4,
   dialTimeout:5_000,
   inboundUpgradeTimeout:5_000,
   inboundStreamProtocolNegotiationTimeout:3_000,
   outboundStreamProtocolNegotiationTimeout:3_000
  }),
  muxer:Object.freeze({
   maxInboundStreams:16,maxOutboundStreams:16,
   maxEarlyStreams:4,maxMessageSize:16_384
  })
 });
}
