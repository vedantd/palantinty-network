import {sandboxSyntheticTransportPolicy} from './synthetic-network-policy.mjs';
import {parseTrustedListen} from './private-lan-policy.mjs';

/**
 * P02b-1 isolated, pre-provisioned local testnet. The privateKey is an
 * independently created libp2p identity; peers must be pinned out of band.
 * No DHT, auto-discovery, relay, wildcard bind or real-sensing pipeline.
 */
export async function createPinnedSyntheticGossipNode({
 privateKey,allowedPeerIds,listen='/ip4/127.0.0.1/tcp/0',
 allowPrivateLan=false,allowedRemoteIps=[]
}={}){
 if(!privateKey||typeof privateKey!=='object')
  throw TypeError('Pre-provisioned libp2p privateKey required');
 // Existing default remains strictly loopback. Private overlay is only
 // allowed after explicit opt-in and independently pinned remote addresses.
 parseTrustedListen(listen,{allowPrivateLan});
 const policy=sandboxSyntheticTransportPolicy({
  allowedPeerIds,allowPrivateLan,allowedRemoteIps
 });
 const [{createLibp2p},{tcp},{noise},{yamux},{identify},{gossipsub}]=
  await Promise.all([
   import('libp2p'),import('@libp2p/tcp'),
   import('@chainsafe/libp2p-noise'),import('@chainsafe/libp2p-yamux'),
   import('@libp2p/identify'),import('@libp2p/gossipsub')
  ]);
 return createLibp2p({
  privateKey,
  addresses:{listen:[listen]},
  transports:[tcp()],
  connectionEncrypters:[noise()],
  streamMuxers:[yamux(policy.muxer)],
  connectionManager:policy.connectionManager,
  connectionGater:policy.connectionGater,
  services:{
   identify:identify(),
   pubsub:gossipsub({
    emitSelf:false,maxInboundStreams:4,maxOutboundStreams:4
   })
  }
 });
}
