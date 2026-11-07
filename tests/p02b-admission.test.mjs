import test from 'node:test';
import assert from 'node:assert/strict';
import {sandboxSyntheticTransportPolicy,isSandboxLoopbackTcp}
 from '../src/synthetic-network-policy.mjs';
import {createPinnedSyntheticGossipNode}
 from '../src/pinned-synthetic-node.mjs';
import {generateKeyPair} from '@libp2p/crypto/keys';
import {peerIdFromPrivateKey} from '@libp2p/peer-id';

test('fail closed on missing, duplicate, malformed or excessive pins',()=>{
 for(const allowedPeerIds of [undefined,[],['not-a-peer'],Array(17).fill('x'),[ 'Qm'+'a'.repeat(44),'Qm'+'a'.repeat(44) ]){
  assert.throws(()=>sandboxSyntheticTransportPolicy({allowedPeerIds}));
 }
});
test('concrete loopback only; no private LAN, wildcard, public, DNS, relays',()=>{
 assert.equal(isSandboxLoopbackTcp('/ip4/127.0.0.1/tcp/2022'),true);
 for(const addr of ['/ip4/0.0.0.0/tcp/2000','/ip4/192.168.1.4/tcp/2000',
  '/ip4/8.8.8.8/tcp/2000','/ip6/::1/tcp/2000',
  '/dns4/example.com/tcp/1000','/ip4/127.0.0.1/tcp/0',
  '/ip4/127.0.0.1/tcp/70000','/ip4/127.0.0.1/tcp/1000/p2p-circuit'])
  assert.equal(isSandboxLoopbackTcp(addr),false,addr);
});
test('connection gater excludes unlisted peer IDs, relay and nonloopback',async()=>{
 const a=peerIdFromPrivateKey(await generateKeyPair('Ed25519'));
 const b=peerIdFromPrivateKey(await generateKeyPair('Ed25519'));
 const {connectionGater:g,connectionManager}=sandboxSyntheticTransportPolicy({
  allowedPeerIds:[a.toString()]
 });
 const local={remoteAddr:'/ip4/127.0.0.1/tcp/12001'};
 const remote={remoteAddr:'/ip4/10.0.0.4/tcp/12001'};
 assert.equal(g.denyDialPeer(a),false);
 assert.equal(g.denyDialPeer(b),true);
 assert.equal(g.denyInboundConnection(local),false);
 assert.equal(g.denyInboundConnection(remote),true);
 assert.equal(g.denyInboundUpgradedConnection(a,local),false);
 assert.equal(g.denyInboundUpgradedConnection(b,local),true);
 assert.equal(g.denyOutboundConnection(b,local),true);
 assert.equal(g.denyOutboundEncryptedConnection(a,remote),true);
 assert.equal(g.denyDialMultiaddr('/ip4/8.8.8.8/tcp/1000'),true);
 assert.equal(g.filterMultiaddrForPeer(b,'/ip4/127.0.0.1/tcp/1000'),false);
 assert.equal(g.denyInboundRelayReservation(),true);
 assert.equal(g.denyInboundRelayedConnection(),true);
 assert.ok(connectionManager.maxConnections<=8);
});
test('pinned loopback peers communicate, unlisted peer is refused',async()=>{
 const keys=await Promise.all(Array.from({length:3},()=>generateKeyPair('Ed25519')));
 const ids=keys.map(key=>peerIdFromPrivateKey(key).toString());
 const nodes=[];
 try{
  for(let i=0;i<3;i++){
   nodes.push(await createPinnedSyntheticGossipNode({
    privateKey:keys[i],
    allowedPeerIds:i===0?[ids[1]]:i===1?[ids[0]]:[ids[0]]
   }));
  }
  const [a,b,c]=nodes;
  await a.peerStore.patch(b.peerId,{multiaddrs:b.getMultiaddrs()});
  await a.dial(b.peerId);
  assert.ok(a.getConnections().some(conn=>conn.remotePeer.toString()===ids[1]));
  await a.peerStore.patch(c.peerId,{multiaddrs:c.getMultiaddrs()});
  await assert.rejects(a.dial(c.peerId));
  assert.ok(!a.getConnections().some(conn=>conn.remotePeer.toString()===ids[2]));
 }finally{
  await Promise.allSettled(nodes.map(n=>n.stop()));
 }
});
test('reject unsafe listen, unprovisioned key or missing pins before opening socket',async()=>{
 const key=await generateKeyPair('Ed25519');
 const peer=peerIdFromPrivateKey(key).toString();
 await assert.rejects(createPinnedSyntheticGossipNode({
  privateKey:key,allowedPeerIds:[peer],listen:'/ip4/0.0.0.0/tcp/0'
 }),/loopback/);
 await assert.rejects(createPinnedSyntheticGossipNode({
  privateKey:key,allowedPeerIds:[]
 }),/allowlist/);
 await assert.rejects(createPinnedSyntheticGossipNode({
  allowedPeerIds:[peer]
 }),/privateKey/);
});
