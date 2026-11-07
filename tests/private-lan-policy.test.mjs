import test from 'node:test';
import assert from 'node:assert/strict';
import {isTrustedAddressIp,parseTrustedListen,parseTrustedIndexerSeed,
 isTrustedRemoteAddress} from '../src/private-lan-policy.mjs';
import {createPrivateNode} from '../src/private-transport.mjs';
import {synchronizeTrustedIndexer,fetchTrustedIndexerSummary}
 from '../src/indexer-sync.mjs';

test('loopback accepted by default, private LAN requires explicit opt-in',()=>{
 assert.equal(isTrustedAddressIp('127.0.0.1'),true);
 assert.equal(isTrustedAddressIp('172.20.5.3'),false);
 for(const ip of ['10.0.0.6','172.16.0.1','172.31.255.255','192.168.2.15']){
  assert.equal(isTrustedAddressIp(ip,{allowPrivateLan:true}),true);
  assert.equal(isTrustedAddressIp(ip),false);
  assert.equal(parseTrustedListen('/ip4/'+ip+'/tcp/0',{allowPrivateLan:true}).toString(),
   '/ip4/'+ip+'/tcp/0');
 }
 assert.equal(parseTrustedListen('/ip4/127.0.0.1/tcp/0').toString(),
  '/ip4/127.0.0.1/tcp/0');
});

test('wildcards, public, link-local, multicast and noncanonical octets fail closed',()=>{
 for(const ip of ['0.0.0.0','8.8.8.8','1.1.1.1','169.254.5.2','224.0.0.1',
  '255.255.255.255','127.0.0.2','172.32.1.2','192.169.1.1',
  '10.1.02.4','010.1.1.1','999.0.0.1','10.0.0']){
  assert.equal(isTrustedAddressIp(ip,{allowPrivateLan:true}),false,ip);
  assert.throws(()=>parseTrustedListen('/ip4/'+ip+'/tcp/0',{allowPrivateLan:true}),ip);
  assert.equal(isTrustedRemoteAddress('/ip4/'+ip+'/tcp/1234',{allowPrivateLan:true}),false,ip);
 }
 assert.throws(()=>parseTrustedListen('/ip4/10.1.1.1/tcp/65536',{allowPrivateLan:true}));
 assert.throws(()=>parseTrustedIndexerSeed('/ip4/10.1.1.1/tcp/0/p2p/abc',{allowPrivateLan:true}));
});

test('private bootstrap requires full concrete IP and pinned peer ID',()=>{
 const ip='172.21.0.5',a='/ip4/'+ip+'/tcp/4001/p2p/QmWmyoCVmCuVu7Aag84LUGD3rHL86utDXGZMSP1UDS4Jrc';
 assert.throws(()=>parseTrustedIndexerSeed(a));
 assert.equal(parseTrustedIndexerSeed(a,{allowPrivateLan:true}).toString(),a);
 assert.equal(isTrustedRemoteAddress('/ip4/'+ip+'/tcp/54921/p2p/ignored',
  {allowPrivateLan:true}),true);
 assert.throws(()=>parseTrustedIndexerSeed('/dns4/node/tcp/4001/p2p/QmFake',
  {allowPrivateLan:true}));
});

test('public listeners rejected even when the caller opts into private LAN',async()=>{
 await assert.rejects(()=>createPrivateNode({listen:'/ip4/0.0.0.0/tcp/0',
  allowPrivateLan:true}));
 await assert.rejects(()=>createPrivateNode({listen:'/ip4/8.8.8.8/tcp/0',
  allowPrivateLan:true}));
 await assert.rejects(()=>createPrivateNode({listen:'/ip4/10.0.0.5/tcp/0'}));
});

test('indexer client validates private LAN opt-in and pinned remote before any dial',async()=>{
 const node={dialProtocol(){throw Error('network call must not happen')}};
 const address='/ip4/172.20.0.7/tcp/4001/p2p/QmWmyoCVmCuVu7Aag84LUGD3rHL86utDXGZMSP1UDS4Jrc';
 const sourceId=address.split('/').at(-1);
 const allowedSourcePeerIds=new Set([sourceId]);
 const index={ingest(){}};
 await assert.rejects(()=>synchronizeTrustedIndexer({
  node,index,peerAddress:address,allowedSourcePeerIds,area:'region-01'
 }),/private LAN opt-in/);
 await assert.rejects(()=>fetchTrustedIndexerSummary({
  node,peerAddress:address,allowedSourcePeerIds,area:'region-01'
 }),/private LAN opt-in/);
 await assert.rejects(()=>synchronizeTrustedIndexer({
  node,index,peerAddress:address,allowedSourcePeerIds:new Set(['wrong-peer']),
  area:'region-01',allowPrivateLan:true
 }),/Untrusted source/);
});
