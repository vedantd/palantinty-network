import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,lstatSync,
 rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {openPersistentPeerIdentity} from '../src/operator-identity.mjs';
import {readP02cHostConfig} from '../src/p02c-host-config.mjs';
import {initializePeerLedger,proposePrivatePeer,approvePrivatePeer,
 revokePrivatePeer} from '../src/p03-private-peer-ledger.mjs';
import {stagePrivatePilotPeer} from '../src/p03-peer-staging.mjs';
import {disablePilot} from '../src/p02c-pilot-operations.mjs';

async function fixture(){
 const root=mkdtempSync(path.join(tmpdir(),'p03b-'));
 const dir=path.join(root,'private');
 mkdirSync(dir,{mode:0o700});
 const self=await openPersistentPeerIdentity(path.join(dir,'operator-identity'));
 const initial=await openPersistentPeerIdentity(path.join(root,'initial'));
 const proposed=await openPersistentPeerIdentity(path.join(root,'proposed'));
 const config={schema:'palantiny.p02c-host-pilot.v1',
  syntheticOnly:true,pilotId:'p03b-private-test',role:'publisher',
  area:'synthetic-enrollment',stateDir:dir,
  listen:'/ip4/127.0.0.1/tcp/40111',allowPrivateLan:false,
  remoteIp:'127.0.0.1',remotePeerId:initial.peerId,
  remoteSeed:'/ip4/127.0.0.1/tcp/40112/p2p/'+initial.peerId};
 const file=path.join(dir,'host-config.json');
 writeFileSync(file,JSON.stringify(config),{flag:'wx',mode:0o600});
 initializePeerLedger(dir,config.pilotId);
 const seed='/ip4/127.0.0.1/tcp/40113/p2p/'+proposed.peerId;
 proposePrivatePeer(dir,config.pilotId,{
  peerId:proposed.peerId,remoteIp:'127.0.0.1',seedAddress:seed
 });
 return {root,dir,config,file,proposed,initial,self,seed,stage:path.join(dir,'staged-config.json')};
}
test('only approved pinned peer and exact revision can stage a new private configuration',async()=>{
 const f=await fixture();
 try{
  const options={configPath:f.file,peerId:f.proposed.peerId,
   expectedRevision:1,outputPath:f.stage};
  await assert.rejects(stagePrivatePilotPeer(options),/Only explicitly approved/);
  approvePrivatePeer(f.dir,f.config.pilotId,f.proposed.peerId,{verifiedOutOfBand:true});
  await assert.rejects(stagePrivatePilotPeer(options),/revision changed/);
  const status=await stagePrivatePilotPeer({...options,expectedRevision:2});
  assert.equal(status.activated,false);
  assert.equal(status.publicTestnetReady,false);
  const staged=readP02cHostConfig(f.stage);
  assert.equal(staged.remotePeerId,f.proposed.peerId);
  assert.equal(staged.remoteSeed,f.seed);
  assert.equal(readP02cHostConfig(f.file).remotePeerId,f.initial.peerId);
  assert.equal(lstatSync(f.stage).mode&0o077,0);
  await assert.rejects(stagePrivatePilotPeer({...options,expectedRevision:2}),e=>e.code==='EEXIST');
  revokePrivatePeer(f.dir,f.config.pilotId,f.proposed.peerId);
  await assert.rejects(stagePrivatePilotPeer({
   ...options,expectedRevision:3,outputPath:path.join(f.dir,'different.json')
  }),/Only explicitly approved/);
 }finally{rmSync(f.root,{recursive:true,force:true});}
});
test('never stage outside private operator directory or expand localhost to private LAN',async()=>{
 const f=await fixture();
 try{
  approvePrivatePeer(f.dir,f.config.pilotId,f.proposed.peerId,{verifiedOutOfBand:true});
  for(const bad of [f.file,path.join(f.root,'escaped.json'),
   path.join(f.dir,'../other.json'),path.join(f.dir,'bad name.json')])
   await assert.rejects(stagePrivatePilotPeer({
    configPath:f.file,peerId:f.proposed.peerId,expectedRevision:2,outputPath:bad
   }));
  const second=await openPersistentPeerIdentity(path.join(f.root,'lan'));
  const seed='/ip4/10.77.21.5/tcp/40115/p2p/'+second.peerId;
  proposePrivatePeer(f.dir,f.config.pilotId,{
   peerId:second.peerId,remoteIp:'10.77.21.5',seedAddress:seed
  });
  approvePrivatePeer(f.dir,f.config.pilotId,second.peerId,{verifiedOutOfBand:true});
  await assert.rejects(stagePrivatePilotPeer({
   configPath:f.file,peerId:second.peerId,expectedRevision:4,outputPath:f.stage
  }),/Invalid|private|allowlist|overlay|synthetic/i);
  assert.equal(existsSync(f.stage),false);
 }finally{rmSync(f.root,{recursive:true,force:true});}
});
test('local emergency stop remains effective after staging a new approved peer',async()=>{
 const f=await fixture();
 try{
  approvePrivatePeer(f.dir,f.config.pilotId,f.proposed.peerId,{verifiedOutOfBand:true});
  disablePilot(f.dir,{reason:'peer-revoked',revokedPeerId:f.initial.peerId});
  await stagePrivatePilotPeer({
   configPath:f.file,peerId:f.proposed.peerId,
   expectedRevision:2,outputPath:f.stage
  });
  assert.equal(existsSync(path.join(f.dir,'PILOT_DISABLED.json')),true);
  assert.equal(readP02cHostConfig(f.stage).remotePeerId,f.proposed.peerId);
  // Staging never authorizes restart: operator control manual resume remains separate.
 }finally{rmSync(f.root,{recursive:true,force:true});}
});
