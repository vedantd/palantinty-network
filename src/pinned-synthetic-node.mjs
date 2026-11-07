import {sandboxSyntheticTransportPolicy} from './synthetic-network-policy.mjs';

/**
 * P02b-1 isolated, pre-provisioned local testnet. The privateKey is an
 * independently created libp2p identity; peers must be pinned out of band.
 * No DHT, auto-discovery, relay, wildcard bind or real-sensing pipeline.
 */
export async function createPinnedSyntheticGossipNode({
 privateKey,allowedPeerIds,listen='/ip4/127.0.0.1/tcp/0'
}={}){
 if(!privateKey||typeof privateKey!=='object')
  throw TypeError('Pre-provisioned libp2p privateKey required');
 if(typeof listen!=='string'||
    !/^\/ip4\/127\.0\.0\.1\/tcp\/(?:0|[1-9][0-9]{0,4})$/.test(listen)||
    Number(listen.split('/').at(-1))>65535)
  throw Error('Synthetic node must listen only on explicit IPv4 loopback');
 const policy=sandboxSyntheticTransportPolicy({allowedPeerIds});
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
