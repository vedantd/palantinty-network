import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair} from '@libp2p/crypto/keys';
import {peerIdFromPrivateKey} from '@libp2p/peer-id';
import {isAllowedSyntheticTcpAddress,validatePinnedSyntheticSeed,
 sandboxSyntheticTransportPolicy} from '../src/synthetic-network-policy.mjs';
import {createPinnedSyntheticGossipNode} from '../src/pinned-synthetic-node.mjs';

test('private transport opt-in rejects public, wildcard, unlisted, DNS and invalid IP',()=>{
 const ips=['10.77.10.2'];
 for(const a of ['/ip4/8.8.8.8/tcp/4001','/ip4/0.0.0.0/tcp/4001',
 '/ip4/10.77.10.3/tcp/4001','/ip4/10.77.10.02/tcp/4001',
 '/ip4/169.254.1.2/tcp/4001','/dns4/host/tcp/4001',
 '/ip4/10.77.10.2/tcp/0','/ip4/10.77.10.2/tcp/70000',
 '/ip4/10.77.10.2/tcp/4001/p2p-circuit']){
  assert.equal(isAllowedSyntheticTcpAddress(a,{allowPrivateLan:true,allowedRemoteIps:ips}),false,a);
 }
 assert.equal(isAllowedSyntheticTcpAddress('/ip4/10.77.10.2/tcp/4001'),false);
 assert.equal(isAllowedSyntheticTcpAddress('/ip4/10.77.10.2/tcp/4001',
 {allowPrivateLan:true,allowedRemoteIps:ips}),true);
 assert.equal(isAllowedSyntheticTcpAddress('/ip4/127.0.0.1/tcp/4001'),true);
});
test('invalid remote-IP configurations fail closed before binding',async()=>{
 const peer=peerIdFromPrivateKey(await generateKeyPair('Ed25519')).toString();
 const base={allowedPeerIds:[peer],allowPrivateLan:true};
 for(const allowedRemoteIps of [[],['8.8.8.8'],['0.0.0.0'],['127.0.0.1'],
   ['10.77.10.2','10.77.10.2'],['10.77.10.02'],Array(17).fill('10.77.10.2')])
  assert.throws(()=>sandboxSyntheticTransportPolicy({...base,allowedRemoteIps}));
 assert.throws(()=>sandboxSyntheticTransportPolicy({
  allowedPeerIds:[peer],allowPrivateLan:false,allowedRemoteIps:['10.77.10.2']
 }));
});
test('pin IP and Noise identity separately; reject spoofed seed PeerID',async()=>{
 const p=peerIdFromPrivateKey(await generateKeyPair('Ed25519')).toString();
 const q=peerIdFromPrivateKey(await generateKeyPair('Ed25519')).toString();
 const options={allowedPeerIds:[p],allowPrivateLan:true,allowedRemoteIps:['10.77.10.2']};
 assert.deepEqual(validatePinnedSyntheticSeed('/ip4/10.77.10.2/tcp/40123/p2p/'+p,options),
  {peerId:p,address:'/ip4/10.77.10.2/tcp/40123/p2p/'+p});
 assert.throws(()=>validatePinnedSyntheticSeed('/ip4/10.77.10.2/tcp/40123/p2p/'+q,options));
 assert.throws(()=>validatePinnedSyntheticSeed('/ip4/10.77.10.3/tcp/40123/p2p/'+p,options));
 assert.throws(()=>validatePinnedSyntheticSeed('/ip4/10.77.10.2/tcp/40123',options));
 const {connectionGater:g}=sandboxSyntheticTransportPolicy(options);
 const allowed={remoteAddr:'/ip4/10.77.10.2/tcp/40123'};
 const unknown={remoteAddr:'/ip4/10.77.10.3/tcp/40123'};
 assert.equal(g.denyInboundUpgradedConnection({toString:()=>p},allowed),false);
 assert.equal(g.denyInboundUpgradedConnection({toString:()=>q},allowed),true);
 assert.equal(g.denyInboundConnection(unknown),true);
 assert.equal(g.denyDialMultiaddr('/ip4/10.77.10.3/tcp/40123'),true);
});
test('private address requires deliberate opt-in; no public listener even when opted in',async()=>{
 const key=await generateKeyPair('Ed25519');
 const peer=peerIdFromPrivateKey(key).toString();
 for(const opts of [
  {listen:'/ip4/10.77.10.1/tcp/4001'},
  {listen:'/ip4/0.0.0.0/tcp/4001',allowPrivateLan:true,allowedRemoteIps:['10.77.10.2']},
  {listen:'/ip4/8.8.8.8/tcp/4001',allowPrivateLan:true,allowedRemoteIps:['10.77.10.2']},
  {listen:'/ip4/10.77.10.1/tcp/4001',allowPrivateLan:true,allowedRemoteIps:[]}
 ])await assert.rejects(createPinnedSyntheticGossipNode({
  privateKey:key,allowedPeerIds:[peer],...opts
 }));
});
