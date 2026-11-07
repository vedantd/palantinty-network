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
 readPrivatePeerLedger,approvedPrivatePeers,rotatePrivatePeer
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

test('revision-checked mutations deny stale operator snapshots without changing ledger',async()=>{
 const f=await fixture();
 try{
  const initial=initializePeerLedger(f.dir,f.pilot);
  assert.equal(initial.revision,0);
  for(const expectedRevision of [-1,1.5,NaN,null,'0',Number.MAX_SAFE_INTEGER+1]){
   assert.throws(()=>proposePrivatePeer(f.dir,f.pilot,{
    peerId:f.id,remoteIp:'10.80.1.2',seedAddress:f.seed,expectedRevision
   }),/Expected revision/);
  }
  const candidate=proposePrivatePeer(f.dir,f.pilot,{
   peerId:f.id,remoteIp:'10.80.1.2',seedAddress:f.seed,expectedRevision:0
  });
  assert.equal(candidate.revision,1);
  assert.throws(()=>proposePrivatePeer(f.dir,f.pilot,{
   peerId:f.id,remoteIp:'10.80.1.2',seedAddress:f.seed,expectedRevision:0
  }),/Stale peer enrollment revision/);
  assert.throws(()=>approvePrivatePeer(f.dir,f.pilot,f.id,{
   verifiedOutOfBand:true,expectedRevision:0
  }),/Stale peer enrollment revision/);
  assert.equal(readPrivatePeerLedger(f.dir,f.pilot).entries[0].state,'candidate');
  const approved=approvePrivatePeer(f.dir,f.pilot,f.id,{
   verifiedOutOfBand:true,expectedRevision:1
  });
  assert.equal(approved.revision,2);
  assert.throws(()=>revokePrivatePeer(f.dir,f.pilot,f.id,{
   expectedRevision:1
  }),/Stale peer enrollment revision/);
  assert.equal(approvedPrivatePeers(f.dir,f.pilot).peers.length,1);
  const revoked=revokePrivatePeer(f.dir,f.pilot,f.id,{
   expectedRevision:2
  });
  assert.equal(revoked.revision,3);
  assert.equal(revoked.entries[0].state,'revoked');
  assert.equal(approvedPrivatePeers(f.dir,f.pilot).peers.length,0);
 }finally{rmSync(f.root,{recursive:true,force:true});}
});
test('abandoned temp snapshots are never recovered as active trust state',async()=>{
 const f=await fixture();
 try{
  const current=initializePeerLedger(f.dir,f.pilot);
  // A crash before rename can leave a complete but uncommitted temp file.
  const orphan=path.join(f.dir,'.p03-orphaned-write.tmp');
  const forged={...current,revision:17,entries:[{
   peerId:f.id,remoteIp:'10.80.1.2',seedAddress:f.seed,
   state:'approved',proposedAt:new Date().toISOString(),
   approvedAt:new Date().toISOString(),revokedAt:null
  }]};
  writeFileSync(orphan,JSON.stringify(forged),{mode:0o600,flag:'wx'});
  assert.equal(readPrivatePeerLedger(f.dir,f.pilot).revision,0);
  assert.equal(approvedPrivatePeers(f.dir,f.pilot).peers.length,0);
  const committed=proposePrivatePeer(f.dir,f.pilot,{
   peerId:f.id,remoteIp:'10.80.1.2',seedAddress:f.seed,expectedRevision:0
  });
  assert.equal(committed.revision,1);
  assert.equal(committed.entries[0].state,'candidate');
  assert.equal(readPrivatePeerLedger(f.dir,f.pilot).revision,1);
  assert.equal((lstatSync(path.join(f.dir,'P03_PRIVATE_PEERS.json')).mode&0o077),0);
 }finally{rmSync(f.root,{recursive:true,force:true});}
});
test('ledger revisions cannot overflow and wrap to a fresh-looking value',async()=>{
 const f=await fixture();
 try{
  initializePeerLedger(f.dir,f.pilot);
  const dest=path.join(f.dir,'P03_PRIVATE_PEERS.json');
  const data=readPrivatePeerLedger(f.dir,f.pilot);
  data.revision=Number.MAX_SAFE_INTEGER;
  writeFileSync(dest,JSON.stringify(data));
  assert.throws(()=>proposePrivatePeer(f.dir,f.pilot,{
   peerId:f.id,remoteIp:'10.80.1.2',seedAddress:f.seed,
   expectedRevision:Number.MAX_SAFE_INTEGER
  }),/revision exhausted/);
  assert.equal(readPrivatePeerLedger(f.dir,f.pilot).revision,Number.MAX_SAFE_INTEGER);
  assert.equal(readPrivatePeerLedger(f.dir,f.pilot).entries.length,0);
 }finally{rmSync(f.root,{recursive:true,force:true});}
});

test('rotation atomically tombstones an approved old peer and stages only a candidate',async()=>{
 const f=await fixture();
 try{
  const next=peerIdFromPrivateKey(await generateKeyPair('Ed25519')).toString();
  initializePeerLedger(f.dir,f.pilot);
  proposePrivatePeer(f.dir,f.pilot,{
   peerId:f.id,remoteIp:'10.80.1.2',seedAddress:f.seed
  });
  approvePrivatePeer(f.dir,f.pilot,f.id,{verifiedOutOfBand:true});
  const rotated=rotatePrivatePeer(f.dir,f.pilot,{
   oldPeerId:f.id,newPeerId:next,remoteIp:'10.80.1.3',
   seedAddress:'/ip4/10.80.1.3/tcp/4099/p2p/'+next,
   expectedRevision:2
  });
  assert.equal(rotated.revision,3,'one transaction must use one revision');
  const old=rotated.entries.find(e=>e.peerId===f.id);
  const replacement=rotated.entries.find(e=>e.peerId===next);
  assert.equal(old.state,'revoked');
  assert.equal(typeof old.revokedAt,'string');
  assert.equal(replacement.state,'candidate');
  assert.equal(replacement.approvedAt,null);
  assert.equal(replacement.revokedAt,null);
  assert.equal(approvedPrivatePeers(f.dir,f.pilot).peers.length,0);
  assert.throws(()=>approvePrivatePeer(f.dir,f.pilot,f.id,{
   verifiedOutOfBand:true
  }),/Only unapproved/);
  assert.throws(()=>proposePrivatePeer(f.dir,f.pilot,{
   peerId:f.id,remoteIp:'10.80.1.2',seedAddress:f.seed
  }),/already exists/);
  assert.throws(()=>rotatePrivatePeer(f.dir,f.pilot,{
   oldPeerId:f.id,newPeerId:next,remoteIp:'10.80.1.3',
   seedAddress:'/ip4/10.80.1.3/tcp/4099/p2p/'+next,
   expectedRevision:3
  }),/Only an approved/);
  assert.equal(approvePrivatePeer(f.dir,f.pilot,next,{
   verifiedOutOfBand:true,expectedRevision:3
  }).revision,4);
  assert.deepEqual(approvedPrivatePeers(f.dir,f.pilot).peers,[{
   peerId:next,remoteIp:'10.80.1.3',
   seedAddress:'/ip4/10.80.1.3/tcp/4099/p2p/'+next
  }]);
 }finally{rmSync(f.root,{recursive:true,force:true});}
});
test('rotation refuses stale review and malformed replacement without revoking old',async()=>{
 const f=await fixture();
 try{
  const next=peerIdFromPrivateKey(await generateKeyPair('Ed25519')).toString();
  initializePeerLedger(f.dir,f.pilot);
  proposePrivatePeer(f.dir,f.pilot,{
   peerId:f.id,remoteIp:'10.80.1.2',seedAddress:f.seed
  });
  approvePrivatePeer(f.dir,f.pilot,f.id,{verifiedOutOfBand:true});
  const args={
   oldPeerId:f.id,newPeerId:next,remoteIp:'10.80.1.3',
   seedAddress:'/ip4/10.80.1.3/tcp/4099/p2p/'+next,
   expectedRevision:2
  };
  for(const bad of [
   {...args,expectedRevision:undefined},
   {...args,expectedRevision:1},
   {...args,expectedRevision:NaN},
   {...args,oldPeerId:next,newPeerId:next},
   {...args,newPeerId:f.id},
   {...args,remoteIp:'8.8.8.8'},
   {...args,seedAddress:f.seed},
   {...args,seedAddress:'/ip4/10.80.1.3/tcp/4099/p2p/'+f.id}
  ])assert.throws(()=>rotatePrivatePeer(f.dir,f.pilot,bad));
  assert.equal(readPrivatePeerLedger(f.dir,f.pilot).revision,2);
  assert.equal(readPrivatePeerLedger(f.dir,f.pilot).entries.length,1);
  assert.equal(approvedPrivatePeers(f.dir,f.pilot).peers[0].peerId,f.id);
 }finally{rmSync(f.root,{recursive:true,force:true});}
});
test('rotation cannot reintroduce an existing or revoked replacement identity',async()=>{
 const f=await fixture();
 try{
  const next=peerIdFromPrivateKey(await generateKeyPair('Ed25519')).toString();
  initializePeerLedger(f.dir,f.pilot);
  proposePrivatePeer(f.dir,f.pilot,{
   peerId:f.id,remoteIp:'10.80.1.2',seedAddress:f.seed
  });
  approvePrivatePeer(f.dir,f.pilot,f.id,{verifiedOutOfBand:true});
  proposePrivatePeer(f.dir,f.pilot,{
   peerId:next,remoteIp:'10.80.1.3',
   seedAddress:'/ip4/10.80.1.3/tcp/4099/p2p/'+next
  });
  revokePrivatePeer(f.dir,f.pilot,next);
  assert.throws(()=>rotatePrivatePeer(f.dir,f.pilot,{
   oldPeerId:f.id,newPeerId:next,remoteIp:'10.80.1.3',
   seedAddress:'/ip4/10.80.1.3/tcp/4099/p2p/'+next,
   expectedRevision:4
  }),/already exists/);
  assert.equal(approvedPrivatePeers(f.dir,f.pilot).peers[0].peerId,f.id);
  assert.equal(readPrivatePeerLedger(f.dir,f.pilot).revision,4);
 }finally{rmSync(f.root,{recursive:true,force:true});}
});
