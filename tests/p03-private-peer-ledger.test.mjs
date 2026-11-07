import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,chmodSync,
 symlinkSync,unlinkSync,rmSync,lstatSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {generateKeyPair} from '@libp2p/crypto/keys';
import {peerIdFromPrivateKey} from '@libp2p/peer-id';
import {
 initializePeerLedger,proposePrivatePeer,approvePrivatePeer,revokePrivatePeer,
 readPrivatePeerLedger,approvedPrivatePeers
} from '../src/p03-private-peer-ledger.mjs';

async function fixture(){
 const root=mkdtempSync(path.join(tmpdir(),'p03a-'));
 const dir=path.join(root,'private');
 mkdirSync(dir,{mode:0o700});
 const id=peerIdFromPrivateKey(await generateKeyPair('Ed25519')).toString();
 return {root,dir,id,pilot:'private-pilot-001',
  seed:'/ip4/10.80.1.2/tcp/4099/p2p/'+id};
}
test('local peer lifecycle is candidate -> explicitly approved -> permanently revoked',async()=>{
 const f=await fixture();
 try{
  assert.equal(initializePeerLedger(f.dir,f.pilot).revision,0);
  assert.throws(()=>initializePeerLedger(f.dir,f.pilot),/already initialized/);
  const proposed=proposePrivatePeer(f.dir,f.pilot,{
   peerId:f.id,remoteIp:'10.80.1.2',seedAddress:f.seed
  });
  assert.equal(proposed.entries[0].state,'candidate');
  assert.equal(approvedPrivatePeers(f.dir,f.pilot).peers.length,0);
  assert.throws(()=>approvePrivatePeer(f.dir,f.pilot,f.id),/verification/);
  assert.equal(approvedPrivatePeers(f.dir,f.pilot).revision,1);
  assert.equal(approvePrivatePeer(f.dir,f.pilot,f.id,{
   verifiedOutOfBand:true
  }).entries[0].state,'approved');
  assert.deepEqual(approvedPrivatePeers(f.dir,f.pilot).peers,[{
   peerId:f.id,remoteIp:'10.80.1.2',seedAddress:f.seed
  }]);
  assert.equal(revokePrivatePeer(f.dir,f.pilot,f.id).entries[0].state,'revoked');
  assert.equal(approvedPrivatePeers(f.dir,f.pilot).peers.length,0);
  assert.throws(()=>proposePrivatePeer(f.dir,f.pilot,{
   peerId:f.id,remoteIp:'10.80.1.2',seedAddress:f.seed
  }),/already exists/);
  assert.throws(()=>approvePrivatePeer(f.dir,f.pilot,f.id,{
   verifiedOutOfBand:true
  }),/Only unapproved/);
  assert.throws(()=>revokePrivatePeer(f.dir,f.pilot,f.id),/Only existing/);
  assert.equal(readPrivatePeerLedger(f.dir,f.pilot).revision,3);
  assert.equal((lstatSync(path.join(f.dir,'P03_PRIVATE_PEERS.json')).mode&0o077),0);
 }finally{rmSync(f.root,{recursive:true,force:true});}
});
test('default denial of untrusted addresses, spoofed seeds and incorrect states',async()=>{
 const f=await fixture();
 try{
  initializePeerLedger(f.dir,f.pilot);
  for(const changes of [
   {remoteIp:'8.8.8.8'},
   {remoteIp:'10.80.1.3'},
   {seedAddress:'/ip4/10.80.1.3/tcp/4099/p2p/'+f.id},
   {seedAddress:'/ip4/10.80.1.2/tcp/4099/p2p/other'},
   {seedAddress:'/ip4/10.80.1.2/tcp/4099/p2p-circuit'}
  ])assert.throws(()=>proposePrivatePeer(f.dir,f.pilot,{
   peerId:f.id,remoteIp:'10.80.1.2',seedAddress:f.seed,...changes
  }));
  assert.equal(readPrivatePeerLedger(f.dir,f.pilot).revision,0);
 }finally{rmSync(f.root,{recursive:true,force:true});}
});
test('corrupt, oversize, symlinked and wrong-pilot files refuse reads and writes',async()=>{
 const f=await fixture();
 try{
  initializePeerLedger(f.dir,f.pilot);
  assert.throws(()=>readPrivatePeerLedger(f.dir,'wrong-pilot'),/Invalid/);
  const p=path.join(f.dir,'P03_PRIVATE_PEERS.json');
  writeFileSync(p,'{}');
  assert.throws(()=>readPrivatePeerLedger(f.dir,f.pilot));
  assert.throws(()=>proposePrivatePeer(f.dir,f.pilot,{
   peerId:f.id,remoteIp:'10.80.1.2',seedAddress:f.seed
  }));
  writeFileSync(p,'x'.repeat(65537));
  assert.throws(()=>readPrivatePeerLedger(f.dir,f.pilot),/Unsafe/);
  unlinkSync(p);symlinkSync('/tmp/does-not-exist-p03a',p);
  assert.throws(()=>readPrivatePeerLedger(f.dir,f.pilot));
  assert.throws(()=>initializePeerLedger(f.dir,f.pilot));
 }finally{rmSync(f.root,{recursive:true,force:true});}
});
test('exclusive writer lock refuses simultaneous or abandoned writers',async()=>{
 const f=await fixture();
 try{
  initializePeerLedger(f.dir,f.pilot);
  const lock=path.join(f.dir,'.P03_PRIVATE_PEERS.lock');
  writeFileSync(lock,'locked',{flag:'wx',mode:0o600});
  assert.throws(()=>proposePrivatePeer(f.dir,f.pilot,{
   peerId:f.id,remoteIp:'10.80.1.2',seedAddress:f.seed
  }),error=>error?.code==='EEXIST');
  assert.equal(readPrivatePeerLedger(f.dir,f.pilot).revision,0);
 }finally{rmSync(f.root,{recursive:true,force:true});}
});
