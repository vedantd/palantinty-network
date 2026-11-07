/**
 * P02b-1: pre-public synthetic-testnet admission and resource policy.
 * Explicit, Noise-authenticated PeerId pins. Never a public listener.
 * This does NOT establish provenance, Sybil resistance or public safety.
 */
const PEER_ID=/^[1-9A-HJ-NP-Za-km-z]{40,128}$/;

export function isSandboxLoopbackTcp(address){
 const value=typeof address==='string'?address:address?.toString?.();
 const match=typeof value==='string' &&
  /^\/ip4\/127\.0\.0\.1\/tcp\/([1-9][0-9]{0,4})(?:\/p2p\/([1-9A-HJ-NP-Za-km-z]+))?$/.exec(value);
 return Boolean(match&&Number(match[1])<=65535);
}

export function sandboxSyntheticTransportPolicy({allowedPeerIds}={}){
 if(!Array.isArray(allowedPeerIds)||allowedPeerIds.length<1||
    allowedPeerIds.length>16||allowedPeerIds.some(
     id=>typeof id!=='string'||!PEER_ID.test(id))||
    new Set(allowedPeerIds).size!==allowedPeerIds.length)
  throw Error('Explicit nonempty, unique authenticated PeerId allowlist required (max 16)');
 const allowed=new Set(allowedPeerIds);
 const trusted=peer=>allowed.has(peer?.toString?.()??'');
 const permitted=(peer,connection)=>trusted(peer)&&
  isSandboxLoopbackTcp(connection?.remoteAddr);
 const gater=Object.freeze({
  denyDialPeer:peer=>!trusted(peer),
  denyDialMultiaddr:addr=>!isSandboxLoopbackTcp(addr),
  filterMultiaddrForPeer:(peer,addr)=>trusted(peer)&&isSandboxLoopbackTcp(addr),
  denyInboundConnection:connection=>!isSandboxLoopbackTcp(connection?.remoteAddr),
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
