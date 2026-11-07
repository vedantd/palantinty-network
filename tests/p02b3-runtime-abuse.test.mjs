import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {setTimeout as sleep} from 'node:timers/promises';
import {generateKeyPair} from '@libp2p/crypto/keys';
import {peerIdFromPrivateKey} from '@libp2p/peer-id';
import {createPinnedSyntheticGossipNode} from '../src/pinned-synthetic-node.mjs';
import {createGossipNode} from '../src/gossip-network.mjs';

/**
 * P02b-3: real TCP/Noise/Yamux localhost exercise.
 * Test peer IDs are synthetic ephemeral keys. Never dial Internet hosts.
 */
async function pair() {
 const keys=await Promise.all([generateKeyPair('Ed25519'),generateKeyPair('Ed25519')]);
 const ids=keys.map(k=>peerIdFromPrivateKey(k).toString());
 const nodes=[];
 try {
  for(let i=0;i<2;i++) {
   nodes.push(await createPinnedSyntheticGossipNode({
    privateKey:keys[i],allowedPeerIds:[ids[1-i]]
   }));
  }
  const [victim,trusted]=nodes;
  for(const node of nodes){
   assert.ok(node.getMultiaddrs().length>0);
   assert.ok(node.getMultiaddrs().every(
    addr=>/^\/ip4\/127\.0\.0\.1\/tcp\/[1-9]\d{0,4}(?:\/p2p\/.*)?$/.test(addr.toString())
   ),'drill must remain loopback-only');
  }
  await trusted.peerStore.patch(victim.peerId,{multiaddrs:victim.getMultiaddrs()});
  return {victim,trusted,nodes};
 }catch(error){
  await Promise.allSettled(nodes.map(node=>node.stop()));
  throw error;
 }
}
async function until(predicate,label,ms=5_000){
 const deadline=Date.now()+ms;
 while(Date.now()<deadline){
  if(predicate())return;
  await sleep(30);
 }
 throw Error('Timeout waiting for '+label);
}
function loopbackPort(node){
 const address=node.getMultiaddrs()[0]?.toString();
 const match=/^\/ip4\/127\.0\.0\.1\/tcp\/([1-9]\d{0,4})/.exec(address??'');
 if(!match)throw Error('Unsafe test address');
 return Number(match[1]);
}
function slowTcpSocket(port){
 return new Promise((resolve,reject)=>{
  const socket=net.createConnection({host:'127.0.0.1',port});
  socket.on('error',()=>{}); // An aborted upgrade may close the TCP socket.
  socket.once('connect',()=>resolve(socket));
  socket.once('error',reject);
  socket.setTimeout(3_000,()=>socket.destroy());
 });
}

test('rotating unlisted Noise PeerIds cannot join an approved live node', {timeout:25_000},async()=>{
 const {victim,trusted,nodes}=await pair();
 const attackers=[];
 try{
  // These are actual libp2p processes and TCP/Noise dial attempts,
  // not mocks or direct calls to a connection-gater callback.
  for(let i=0;i<3;i++)attackers.push(await createGossipNode());
  for(const attacker of attackers){
   await attacker.peerStore.patch(victim.peerId,{multiaddrs:victim.getMultiaddrs()});
  }
  const attempts=await Promise.allSettled(attackers.map(attacker=>
   attacker.dial(victim.peerId,{signal:AbortSignal.timeout(7_000)})));
  // Dial resolution can race with the remote Noise/upgrade rejection.
  // Record the transient result, then require both sides to remove any
  // unauthorized authenticated connections before accepting this drill.
  const transientDials=attempts.filter(x=>x.status==='fulfilled').length;
  await until(()=>victim.getConnections().length===0 &&
    attackers.every(peer=>peer.getConnections(victim.peerId).length===0),
   'unauthorized peer connections to be evicted',4_000);
  assert.equal(victim.getConnections().length,0,
   'unlisted identities must not remain connected');
  assert.ok(transientDials<=attackers.length);
  const conn=await trusted.dial(victim.peerId,{signal:AbortSignal.timeout(7_000)});
  assert.equal(conn.remotePeer.toString(),victim.peerId.toString());
  await until(()=>victim.getConnections().some(connection=>
   connection.remotePeer.toString()===trusted.peerId.toString()),
   'authorized inbound connection after unauthorized-peer pressure');
  assert.ok(victim.getConnections().every(connection=>
   connection.remotePeer.toString()===trusted.peerId.toString()),
   'only a pinned peer may remain connected');
 }finally{
  await Promise.allSettled([...attackers,...nodes].map(node=>node.stop()));
 }
});

test('slow raw TCP handshakes do not authorize peers; trusted peer recovers', {timeout:25_000},async()=>{
 const {victim,trusted,nodes}=await pair();
 const sockets=[];
 try{
  const connected=await Promise.allSettled(Array.from({length:6},()=>
   slowTcpSocket(loopbackPort(victim))));
  for(const record of connected)if(record.status==='fulfilled')sockets.push(record.value);
  assert.ok(sockets.length>=1,'must exercise at least one live raw TCP connection');
  await sleep(200);
  assert.ok(victim.getConnections().every(connection=>
   connection.remotePeer.toString()===trusted.peerId.toString()));
  assert.equal(victim.getConnections().length,0,
   'idle unauthenticated TCP sockets must not count as approved libp2p peers');
  // Release stalled sockets, then demonstrate approved dial remains possible.
  for(const socket of sockets)socket.destroy();
  await sleep(1_100); // clear the per-host inbound-connection rate window
  const conn=await trusted.dial(victim.peerId,{signal:AbortSignal.timeout(7_000)});
  assert.equal(conn.remotePeer.toString(),victim.peerId.toString());
 }finally{
  for(const socket of sockets)socket.destroy();
  await Promise.allSettled(nodes.map(node=>node.stop()));
 }
});

test('live stream-per-protocol ceiling rejects surplus work and restores capacity', {timeout:25_000},async()=>{
 const {victim,trusted,nodes}=await pair();
 const protocol='/palantiny-network/testnet/abuse-drill/1.0.0';
 const held=[];
 let active=0,peak=0,handled=0;
 try{
  // Test-only handler with a deliberately small limit. No new runtime
  // protocol is exposed by the production pinned-node factory.
  await victim.handle(protocol,stream=>{
   handled++;active++;peak=Math.max(active,peak);
   let closed=false;
   const release=()=>{if(!closed){closed=true;active--;}};
   stream.addEventListener('close',release);
   stream.addEventListener('error',release);
  },{maxInboundStreams:2,maxOutboundStreams:2});
  await trusted.dial(victim.peerId,{signal:AbortSignal.timeout(6_000)});
  held.push(await trusted.dialProtocol(victim.peerId,protocol,
   {signal:AbortSignal.timeout(6_000)}));
  await until(()=>active===1,'first live inbound stream');
  held.push(await trusted.dialProtocol(victim.peerId,protocol,
   {signal:AbortSignal.timeout(6_000)}));
  await until(()=>active===2,'second live inbound stream');
  const pressure=await Promise.allSettled(Array.from({length:8},()=>trusted.dialProtocol(
   victim.peerId,protocol,{signal:AbortSignal.timeout(3_000)}
  )));
  for(const result of pressure)if(result.status==='fulfilled')held.push(result.value);
  await sleep(150);
  assert.equal(peak,2,'per-protocol inbound ceiling must never be exceeded');
  assert.equal(handled,2,'surplus streams must not invoke test handler');
  // Closing all client streams should release the per-protocol slot.
  for(const stream of held)try{stream.abort(new Error('end test stream'));}catch{}
  await until(()=>active===0,'inbound stream cleanup');
  const resumed=await trusted.dialProtocol(victim.peerId,protocol,
   {signal:AbortSignal.timeout(6_000)});
  held.push(resumed);
  await until(()=>handled===3,'stream accepted after release');
  assert.equal(peak,2);
 }finally{
  for(const stream of held)try{stream.abort(new Error('drill cleanup'));}catch{}
  await Promise.allSettled(nodes.map(node=>node.stop()));
 }
});
