import test from 'node:test';
import assert from 'node:assert/strict';
import {createGossipNode} from '../src/gossip-network.mjs';
import {parseLocalSeed,connectLocalSeed} from '../src/peer-bootstrap.mjs';

test('reject nonlocal or unqualified seed addresses before dialing',()=>{
 for(const a of ['/ip4/0.0.0.0/tcp/1234/p2p/abc',
 '/ip4/192.168.1.1/tcp/1234/p2p/abc',
 '/ip4/127.0.0.1/tcp/0/p2p/abc',
 '/ip4/127.0.0.1/tcp/99999/p2p/abc',
 '/ip4/127.0.0.1/tcp/1234','https://example.com'])assert.throws(()=>parseLocalSeed(a));
});
test('retries failed seed dial with bounded exponential backoff',async()=>{
 const peer=await createGossipNode();
 try{
  const base=peer.getMultiaddrs()[0].toString();
  const address=base.includes('/p2p/')?base:base+'/p2p/'+peer.peerId.toString();
  const waits=[];
  let attempts=0;
  const remote={dial:async()=>{if(++attempts<3)throw Error('offline');return {ok:true};}};
  const response=await connectLocalSeed(remote,address,{
   attempts:3,baseDelayMs:20,sleep:async(ms)=>waits.push(ms)});
  assert.deepEqual(waits,[20,40]);
  assert.equal(response.attempts,3);
  assert.equal(response.connected,true);
  assert.equal(response.remotePeer,peer.peerId.toString());
  await assert.rejects(connectLocalSeed({dial:async()=>{throw Error('offline')}},address,{
   attempts:2,baseDelayMs:0,sleep:async()=>{}}),/unreachable after 2/);
 }finally{await peer.stop();}
});
test('reconnect policy rejects invalid parameters',async()=>{
 const peer=await createGossipNode();
 try{
  const base=peer.getMultiaddrs()[0].toString();
  const address=base.includes('/p2p/')?base:base+'/p2p/'+peer.peerId.toString();
  await assert.rejects(()=>connectLocalSeed({dial:()=>{}},address,{attempts:0}),RangeError);
  await assert.rejects(()=>connectLocalSeed({dial:()=>{}},address,{attempts:11}),RangeError);
  await assert.rejects(()=>connectLocalSeed({},address),TypeError);
 }finally{await peer.stop();}
});
