import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {openPersistentPeerIdentity} from '../src/operator-identity.mjs';
import {initializePeerLedger,proposePrivatePeer,approvePrivatePeer,revokePrivatePeer} from '../src/p03-private-peer-ledger.mjs';
import {disablePilot} from '../src/p02c-pilot-operations.mjs';
import {inspectPrivatePilotStartup} from '../src/p03-startup-inspection.mjs';

test('P03d offline inspection is read-only, requires approved pin and respects local stop',async()=>{
 const root=mkdtempSync(path.join(tmpdir(),'p03d-'));
 try {
  const dir=path.join(root,'private');mkdirSync(dir,{mode:0o700});
  const local=await openPersistentPeerIdentity(path.join(dir,'operator-identity'));
  const remote=await openPersistentPeerIdentity(path.join(root,'remote'));
  const pilotId='p03d-startup';
  const seed='/ip4/127.0.0.1/tcp/41112/p2p/'+remote.peerId;
  const config={schema:'palantiny.p02c-host-pilot.v1',syntheticOnly:true,
   pilotId,role:'publisher',area:'synthetic-startup',stateDir:dir,
   listen:'/ip4/127.0.0.1/tcp/41111',allowPrivateLan:false,
   remoteIp:'127.0.0.1',remotePeerId:remote.peerId,remoteSeed:seed};
  const file=path.join(dir,'host.json');
  writeFileSync(file,JSON.stringify(config),{mode:0o600});
  initializePeerLedger(dir,pilotId);
  let result=await inspectPrivatePilotStartup(file);
  assert.equal(result.readyForManualReview,false);
  assert.deepEqual(result.reasons,['remote-peer-not-enrolled']);
  proposePrivatePeer(dir,pilotId,{peerId:remote.peerId,remoteIp:'127.0.0.1',seedAddress:seed});
  result=await inspectPrivatePilotStartup(file);
  assert.deepEqual(result.reasons,['remote-peer-not-approved']);
  approvePrivatePeer(dir,pilotId,remote.peerId,{verifiedOutOfBand:true});
  result=await inspectPrivatePilotStartup(file);
  assert.equal(result.readyForManualReview,true);
  assert.equal(result.localPeerId,local.peerId);
  assert.equal(result.activated,false);
  assert.equal(result.publicTestnetReady,false);
  revokePrivatePeer(dir,pilotId,remote.peerId);
  result=await inspectPrivatePilotStartup(file);
  assert.equal(result.readyForManualReview,false);
  disablePilot(dir,{reason:'emergency-stop'});
  await assert.rejects(inspectPrivatePilotStartup(file),/disabled/);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('P03d refuses missing private config and missing local identity',async()=>{
 await assert.rejects(inspectPrivatePilotStartup('/nonexistent/p03d-config.json'));
 const root=mkdtempSync(path.join(tmpdir(),'p03d-negative-'));
 try{
  const dir=path.join(root,'private');mkdirSync(dir,{mode:0o700});
  const remote=await openPersistentPeerIdentity(path.join(root,'remote'));
  const pilotId='p03d-negative';
  const file=path.join(dir,'host.json');
  writeFileSync(file,JSON.stringify({
   schema:'palantiny.p02c-host-pilot.v1',syntheticOnly:true,pilotId,
   role:'publisher',area:'synthetic-startup',stateDir:dir,
   listen:'/ip4/127.0.0.1/tcp/41111',allowPrivateLan:false,
   remoteIp:'127.0.0.1',remotePeerId:remote.peerId,
   remoteSeed:'/ip4/127.0.0.1/tcp/41112/p2p/'+remote.peerId
  }),{mode:0o600});
  initializePeerLedger(dir,pilotId);
  await assert.rejects(inspectPrivatePilotStartup(file));
 }finally{rmSync(root,{recursive:true,force:true});}
});
