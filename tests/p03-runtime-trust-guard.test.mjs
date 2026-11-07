import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {openPersistentPeerIdentity} from '../src/operator-identity.mjs';
import {initializePeerLedger,proposePrivatePeer,approvePrivatePeer,
 revokePrivatePeer} from '../src/p03-private-peer-ledger.mjs';
import {assertApprovedPrivatePilot,watchApprovedPrivatePilot} from '../src/p03-runtime-trust-guard.mjs';

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
