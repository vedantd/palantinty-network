import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {once} from 'node:events';
import {spawn,spawnSync} from 'node:child_process';
import {openPersistentPeerIdentity} from '../src/operator-identity.mjs';
import {initializePeerLedger,proposePrivatePeer,approvePrivatePeer,
 revokePrivatePeer,rotatePrivatePeer,readPrivatePeerLedger} from '../src/p03-private-peer-ledger.mjs';
import {assertApprovedPrivatePilot,watchApprovedPrivatePilot} from '../src/p03-runtime-trust-guard.mjs';
import {stagePrivatePilotPeer} from '../src/p03-peer-staging.mjs';
import {runPrivatePilotOperation} from '../src/p03-private-operation-gate.mjs';

async function port(){
 const server=net.createServer();
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const n=server.address().port;
 await new Promise(resolve=>server.close(resolve));
 return n;
}
async function setup(){
 const root=mkdtempSync(path.join(tmpdir(),'p03-guard-'));
 const state=path.join(root,'operator');mkdirSync(state,{mode:0o700});
 const local=await openPersistentPeerIdentity(path.join(state,'operator-identity'));
 const remote=await openPersistentPeerIdentity(path.join(root,'remote'));
 const config={
  schema:'palantiny.p02c-host-pilot.v1',syntheticOnly:true,
  pilotId:'p03-live-guard',role:'observer',area:'synthetic-live-guard',
  stateDir:state,listen:'/ip4/127.0.0.1/tcp/'+await port(),
  allowPrivateLan:false,remoteIp:'127.0.0.1',remotePeerId:remote.peerId,
  remoteSeed:'/ip4/127.0.0.1/tcp/'+await port()+'/p2p/'+remote.peerId
 };
 const configPath=path.join(state,'pilot.json');
 writeFileSync(configPath,JSON.stringify(config),{mode:0o600,flag:'wx'});
 return {root,state,config,configPath,local,remote};
}
function enroll(f){
 initializePeerLedger(f.state,f.config.pilotId);
 proposePrivatePeer(f.state,f.config.pilotId,{
  peerId:f.remote.peerId,remoteIp:f.config.remoteIp,seedAddress:f.config.remoteSeed
 });
 approvePrivatePeer(f.state,f.config.pilotId,f.remote.peerId,{verifiedOutOfBand:true});
}
test('private pilot cannot start with missing, candidate, revoked, or drifted approval',async()=>{
 const f=await setup();
 try{
  assert.throws(()=>assertApprovedPrivatePilot(f.configPath));
  initializePeerLedger(f.state,f.config.pilotId);
  assert.throws(()=>assertApprovedPrivatePilot(f.configPath),/not approved/);
  proposePrivatePeer(f.state,f.config.pilotId,{
   peerId:f.remote.peerId,remoteIp:f.config.remoteIp,
   seedAddress:f.config.remoteSeed
  });
  assert.throws(()=>assertApprovedPrivatePilot(f.configPath),/not approved/);
  approvePrivatePeer(f.state,f.config.pilotId,f.remote.peerId,{verifiedOutOfBand:true});
  const accepted=assertApprovedPrivatePilot(f.configPath);
  assert.equal(accepted.approved,true);
  assert.equal(accepted.publicTestnetReady,false);
  const altered={...f.config,remoteSeed:
   '/ip4/127.0.0.1/tcp/40197/p2p/'+f.remote.peerId};
  writeFileSync(f.configPath,JSON.stringify(altered));
  assert.throws(()=>assertApprovedPrivatePilot(f.configPath),/not approved/);
  writeFileSync(f.configPath,JSON.stringify(f.config));
  revokePrivatePeer(f.state,f.config.pilotId,f.remote.peerId);
  assert.throws(()=>assertApprovedPrivatePilot(f.configPath),/not approved/);
 }finally{rmSync(f.root,{recursive:true,force:true});}
});
test('a ledger revision change triggers a one-way fail-closed stop',async()=>{
 const f=await setup();
 let trips=0;
 try{
  enroll(f);
  const guard=watchApprovedPrivatePilot(f.configPath,{
   onTrip:()=>trips++,intervalMs:25
  });
  try{
   guard.check();
   const unrelated=await openPersistentPeerIdentity(path.join(f.root,'candidate'));
   proposePrivatePeer(f.state,f.config.pilotId,{
    peerId:unrelated.peerId,remoteIp:'127.0.0.1',
    seedAddress:'/ip4/127.0.0.1/tcp/40194/p2p/'+unrelated.peerId
   });
   await new Promise(resolve=>setTimeout(resolve,90));
   assert.equal(guard.tripped(),true);
   assert.equal(trips,1);
   assert.throws(()=>guard.check(),/revoked/);
  }finally{guard.close();}
 }finally{rmSync(f.root,{recursive:true,force:true});}
});
test('an active private libp2p observer stops on ledger revocation and cannot restart',
 {timeout:14000},async()=>{
 const f=await setup();
 let child,finished;
 const events=[];let stdout='',stderr='';
 try{
  enroll(f);
  child=spawn(process.execPath,['apps/p02c-host-pilot.mjs','observe',f.configPath],{
   cwd:path.resolve(import.meta.dirname,'..'),
   stdio:['ignore','pipe','pipe']
  });
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',chunk=>{
   stdout+=chunk;
   let end;
   while((end=stdout.indexOf('\n'))>=0){
    const line=stdout.slice(0,end);stdout=stdout.slice(end+1);
    try{events.push(JSON.parse(line));}catch{}
   }
  });
  child.stderr.on('data',chunk=>{stderr+=chunk;});
  finished=new Promise((resolve,reject)=>{
   child.once('error',reject);child.once('close',resolve);
  });
  const deadline=Date.now()+7000;
  while(!events.some(e=>e.event==='started')&&Date.now()<deadline){
   if(child.exitCode!==null)throw Error('Pilot unexpectedly exited: '+stderr);
   await new Promise(resolve=>setTimeout(resolve,25));
  }
  assert.ok(events.some(e=>e.event==='started'),stderr);
  revokePrivatePeer(f.state,f.config.pilotId,f.remote.peerId);
  const result=await finished;
  assert.notEqual(result,0);
  assert.ok(events.some(e=>e.event==='local-shutdown'&&
   e.reason==='peer-approval-lost'),'expected peer trust watcher shutdown: '+stderr);
  assert.equal(events.some(e=>e.event==='observer-complete'),false);
  assert.throws(()=>assertApprovedPrivatePilot(f.configPath),/not approved/);
 }finally{
  if(child?.exitCode===null)child.kill('SIGKILL');
  await finished?.catch(()=>{});
  rmSync(f.root,{recursive:true,force:true});
 }
});

test('watchdog permanently trips on transient config corruption even after repair',async()=>{
 const f=await setup();
 let trips=0;let observed;
 try{
  enroll(f);
  const guard=watchApprovedPrivatePilot(f.configPath,{
   onTrip:error=>{trips++;observed=error;},intervalMs:5000
  });
  try{
   guard.check();
   writeFileSync(f.configPath,'{broken-json');
   assert.throws(()=>guard.check());
   assert.equal(guard.tripped(),true);
   assert.equal(trips,1);
   assert.ok(observed instanceof Error);
   writeFileSync(f.configPath,JSON.stringify(f.config));
   assert.doesNotThrow(()=>assertApprovedPrivatePilot(f.configPath));
   assert.throws(()=>guard.check(),/trust revoked/);
   assert.equal(trips,1,'must never issue a second trip callback');
  }finally{guard.close();}
 }finally{rmSync(f.root,{recursive:true,force:true});}
});
test('watchdog permanently trips on approved peer config drift even after rollback',async()=>{
 const f=await setup();let trips=0;
 try{
  enroll(f);
  const guard=watchApprovedPrivatePilot(f.configPath,{
   onTrip:()=>trips++,intervalMs:5000
  });
  try{
   const drift={...f.config,remoteSeed:
    '/ip4/127.0.0.1/tcp/40197/p2p/'+f.remote.peerId};
   writeFileSync(f.configPath,JSON.stringify(drift));
   assert.throws(()=>guard.check());
   writeFileSync(f.configPath,JSON.stringify(f.config));
   assert.throws(()=>guard.check(),/trust revoked/);
   assert.equal(trips,1);
  }finally{guard.close();}
 }finally{rmSync(f.root,{recursive:true,force:true});}
});

test('private asynchronous dial refuses success when approval is revoked during await',async()=>{
 const f=await setup();let trips=0,started=0;
 try{
  enroll(f);
  const guard=watchApprovedPrivatePilot(f.configPath,{
   onTrip:()=>trips++,intervalMs:5000
  });
  try{
   await assert.rejects(
    runPrivatePilotOperation(()=>guard.check(),async()=>{
     started++;
     // Emulates a network dial already in flight when the operator revokes.
     await Promise.resolve();
     revokePrivatePeer(f.state,f.config.pilotId,f.remote.peerId);
     return {connected:true};
    }),
    /not approved|changed|revoked/i
   );
   assert.equal(started,1,'network operation really started');
   assert.equal(guard.tripped(),true);
   assert.equal(trips,1);
   assert.throws(()=>guard.check(),/trust revoked/);
  }finally{guard.close();}
 }finally{rmSync(f.root,{recursive:true,force:true});}
});
test('private asynchronous publish cannot claim success after a pinned seed changes',async()=>{
 const f=await setup();let trips=0;
 try{
  enroll(f);
  const guard=watchApprovedPrivatePilot(f.configPath,{
   onTrip:()=>trips++,intervalMs:5000
  });
  try{
   await assert.rejects(runPrivatePilotOperation(()=>guard.check(),async()=>{
    const changed={...f.config,remoteSeed:
      '/ip4/127.0.0.1/tcp/40197/p2p/'+f.remote.peerId};
    writeFileSync(f.configPath,JSON.stringify(changed));
    await Promise.resolve();
    return {reportId:'synthetic-only'};
   }),/not approved|changed|revoked/i);
   writeFileSync(f.configPath,JSON.stringify(f.config));
   assert.throws(()=>guard.check(),/trust revoked/);
   assert.equal(trips,1);
  }finally{guard.close();}
 }finally{rmSync(f.root,{recursive:true,force:true});}
});
test('precheck denies an unauthorized operation; postcheck also runs on transport failure',async()=>{
 const f=await setup();let trips=0,calls=0;
 try{
  enroll(f);
  const ok=watchApprovedPrivatePilot(f.configPath,{
   onTrip:()=>trips++,intervalMs:5000
  });
  try{
   const transportError=new Error('expected network timeout');
   await assert.rejects(runPrivatePilotOperation(()=>ok.check(),async()=>{
    calls++;
    throw transportError;
   }),error=>error===transportError);
   assert.equal(calls,1);
   assert.equal(ok.tripped(),false);
   revokePrivatePeer(f.state,f.config.pilotId,f.remote.peerId);
   await assert.rejects(runPrivatePilotOperation(()=>ok.check(),async()=>{
    calls++;
   }),/not approved|changed|revoked/i);
   assert.equal(calls,1,'no new network action while revoked');
   assert.equal(trips,1);
  }finally{ok.close();}
 }finally{rmSync(f.root,{recursive:true,force:true});}
});

test('rotation trips an active guard; new candidate requires approval and separate staging',async()=>{
 const f=await setup();let trips=0;
 try{
  enroll(f);
  const replacement=await openPersistentPeerIdentity(path.join(f.root,'replacement'));
  const seed='/ip4/127.0.0.1/tcp/40199/p2p/'+replacement.peerId;
  const guard=watchApprovedPrivatePilot(f.configPath,{
   onTrip:()=>trips++,intervalMs:5000
  });
  try{
   guard.check();
   const rotated=rotatePrivatePeer(f.state,f.config.pilotId,{
    oldPeerId:f.remote.peerId,newPeerId:replacement.peerId,
    remoteIp:'127.0.0.1',seedAddress:seed,expectedRevision:2
   });
   assert.equal(rotated.revision,3);
   assert.throws(()=>guard.check(),/changed|revoked|not approved/i);
   assert.equal(guard.tripped(),true);
   assert.equal(trips,1);
   assert.throws(()=>assertApprovedPrivatePilot(f.configPath),/not approved/i);
   const staged=path.join(f.state,'rotated-peer.json');
   await assert.rejects(stagePrivatePilotPeer({
    configPath:f.configPath,peerId:replacement.peerId,
    expectedRevision:3,outputPath:staged
   }),/Only explicitly approved/);
   const approved=approvePrivatePeer(f.state,f.config.pilotId,replacement.peerId,{
    verifiedOutOfBand:true,expectedRevision:3
   });
   assert.equal(approved.revision,4);
   assert.throws(()=>assertApprovedPrivatePilot(f.configPath),/not approved/i);
   const result=await stagePrivatePilotPeer({
    configPath:f.configPath,peerId:replacement.peerId,
    expectedRevision:4,outputPath:staged
   });
   assert.equal(result.activated,false);
   assert.equal(result.publicTestnetReady,false);
   assert.equal(result.stagedPeerId,replacement.peerId);
   assert.doesNotThrow(()=>assertApprovedPrivatePilot(staged));
   assert.throws(()=>guard.check(),/trust revoked/i);
   assert.equal(trips,1);
   const ledger=readPrivatePeerLedger(f.state,f.config.pilotId);
   assert.equal(ledger.entries.find(e=>e.peerId===f.remote.peerId).state,'revoked');
  }finally{guard.close();}
 }finally{rmSync(f.root,{recursive:true,force:true});}
});

test('offline rotation CLI rejects wrong configured peer and stale revision',async()=>{
 const f=await setup();
 try{
  enroll(f);
  const replacement=await openPersistentPeerIdentity(path.join(f.root,'replacement-cli'));
  const seed='/ip4/127.0.0.1/tcp/40188/p2p/'+replacement.peerId;
  const script=path.resolve(import.meta.dirname,'../apps/p03-peer-enrollment.mjs');
  const call=(old,revision)=>spawnSync(process.execPath,[script,'rotate',f.configPath,
   old,replacement.peerId,'127.0.0.1',seed,String(revision)],{
   cwd:path.resolve(import.meta.dirname,'..'),encoding:'utf8',timeout:5000
  });
  const wrong=call(replacement.peerId,2);
  assert.notEqual(wrong.status,0);
  assert.match(wrong.stderr,/currently configured/);
  assert.equal(readPrivatePeerLedger(f.state,f.config.pilotId).revision,2);
  const success=call(f.remote.peerId,2);
  assert.equal(success.status,0,success.stderr);
  const output=JSON.parse(success.stdout);
  assert.equal(output.revision,3);
  assert.equal(output.publicTestnetReady,false);
  assert.equal(output.entries.find(e=>e.peerId===replacement.peerId).state,'candidate');
  assert.notEqual(call(f.remote.peerId,2).status,0);
  assert.equal(readPrivatePeerLedger(f.state,f.config.pilotId).revision,3);
 }finally{rmSync(f.root,{recursive:true,force:true});}
});
