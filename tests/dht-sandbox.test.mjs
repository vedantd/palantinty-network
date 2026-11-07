import test from 'node:test';
import assert from 'node:assert/strict';
import {createGossipNode} from '../src/gossip-network.mjs';
test('DHT is disabled by default and opt-in serves only on loopback',async()=>{
 const defaultNode=await createGossipNode();
 const kadNode=await createGossipNode({enableDht:true});
 try{
  assert.equal(defaultNode.services.dht,undefined);
  assert.ok(kadNode.services.dht);
  assert.equal(await kadNode.services.dht.getMode(),'server');
  assert.ok(kadNode.getMultiaddrs().every(a=>a.toString().includes('/ip4/127.0.0.1/')));
 }finally{await Promise.allSettled([defaultNode.stop(),kadNode.stop()]);}
});
test('DHT mode requires explicit boolean and never accepts public listener',async()=>{
 await assert.rejects(()=>createGossipNode({enableDht:'true'}),TypeError);
 await assert.rejects(()=>createGossipNode({enableDht:true,listen:'/ip4/0.0.0.0/tcp/0'}),/loopback/);
});
