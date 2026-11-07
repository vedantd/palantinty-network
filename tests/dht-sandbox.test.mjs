import test from 'node:test';
import assert from 'node:assert/strict';
import {createGossipNode} from '../src/gossip-network.mjs';
test('DHT is disabled by default on ordinary GossipSub nodes',async()=>{
 const node=await createGossipNode();
 try{ assert.equal(node.services.dht,undefined); }
 finally{await node.stop();}
});
test('DHT mode requires explicit boolean and never accepts public listener',async()=>{
 await assert.rejects(()=>createGossipNode({enableDht:'true'}),TypeError);
 await assert.rejects(()=>createGossipNode({enableDht:true,listen:'/ip4/0.0.0.0/tcp/0'}),/loopback/);
});
