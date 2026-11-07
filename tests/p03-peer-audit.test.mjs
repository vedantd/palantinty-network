import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {openPersistentPeerIdentity} from '../src/operator-identity.mjs';
import {initializePeerLedger,proposePrivatePeer,approvePrivatePeer,revokePrivatePeer} from '../src/p03-private-peer-ledger.mjs';
import {auditPrivatePilotPeer} from '../src/p03-peer-audit.mjs';

test('offline trust audit rejects unknown, candidate, revoked and pin drift; accepts exact approved pin',async()=>{
 const root=mkdtempSync(path.join(tmpdir(),'p03c-'));
 try{
  const dir=path.join(root,'private');mkdirSync(dir,{mode:0o700});
  const remote=await openPersistentPeerIdentity(path.join(root,'remote'));
  const seed='/ip4/127.0.0.1/tcp/40112/p2p/'+remote.peerId;
  const pilotId='p03c-audit-test';
  const config={schema:'palantiny.p02c-host-pilot.v1',syntheticOnly:true,
   pilotId,role:'publisher',area:'synthetic-audit',stateDir:dir,
   listen:'/ip4/127.0.0.1/tcp/40111',allowPrivateLan:false,
   remoteIp:'127.0.0.1',remotePeerId:remote.peerId,remoteSeed:seed};
  const file=path.join(dir,'host.json');
  const write=()=>writeFileSync(file,JSON.stringify(config),{mode:0o600});
  write();initializePeerLedger(dir,pilotId);
  assert.deepEqual(auditPrivatePilotPeer(file).reasons,['remote-peer-not-enrolled']);
  proposePrivatePeer(dir,pilotId,{peerId:remote.peerId,remoteIp:'127.0.0.1',seedAddress:seed});
  assert.deepEqual(auditPrivatePilotPeer(file).reasons,['remote-peer-not-approved']);
  approvePrivatePeer(dir,pilotId,remote.peerId,{verifiedOutOfBand:true});
  assert.equal(auditPrivatePilotPeer(file).consistent,true);
  config.remoteSeed='/ip4/127.0.0.1/tcp/40113/p2p/'+remote.peerId;write();
  assert.deepEqual(auditPrivatePilotPeer(file).reasons,['remote-seed-drift']);
  config.remoteSeed=seed;write();
  revokePrivatePeer(dir,pilotId,remote.peerId);
  const result=auditPrivatePilotPeer(file);
  assert.equal(result.consistent,false);
  assert.deepEqual(result.reasons,['remote-peer-not-approved']);
  assert.equal(result.activated,false);
  assert.equal(result.publicTestnetReady,false);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('audit fails closed on missing or unsafe config',()=>{
 assert.throws(()=>auditPrivatePilotPeer('/nonexistent/p03-host.json'));
});
