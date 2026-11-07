import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {openPersistentPeerIdentity} from '../src/operator-identity.mjs';
import {initializePeerLedger,proposePrivatePeer,approvePrivatePeer,revokePrivatePeer} from '../src/p03-private-peer-ledger.mjs';
import {disablePilot,resumePilot,isPilotDisabled,assertPilotEnabled,
 pilotStopPath,watchPilotStop} from '../src/p02c-pilot-operations.mjs';

async function setup(){
 const root=mkdtempSync(path.join(tmpdir(),'p02c3-'));
 const state=path.join(root,'operator');
 mkdirSync(state,{mode:0o700});
 const local=await openPersistentPeerIdentity(path.join(state,'operator-identity'));
 const other=await openPersistentPeerIdentity(path.join(root,'remote'));
 const config={schema:'palantiny.p02c-host-pilot.v1',syntheticOnly:true,
  pilotId:'local-stop-test',role:'observer',area:'synthetic-stop-test',
  stateDir:state,listen:'/ip4/127.0.0.1/tcp/0',allowPrivateLan:false,
  remoteIp:'127.0.0.1',remotePeerId:other.peerId,
  remoteSeed:'/ip4/127.0.0.1/tcp/40124/p2p/'+other.peerId};
 // Observer requires an explicit port, but we're not opening any public IP.
 config.listen='/ip4/127.0.0.1/tcp/41249';
 const file=path.join(state,'host-config.json');
 writeFileSync(file,JSON.stringify(config),{mode:0o600});
 initializePeerLedger(state,config.pilotId);
 proposePrivatePeer(state,config.pilotId,{
  peerId:other.peerId,remoteIp:config.remoteIp,seedAddress:config.remoteSeed
 });
 approvePrivatePeer(state,config.pilotId,other.peerId,{verifiedOutOfBand:true});
 return {root,state,file,local,other};
}
test('persistent local disable is fail-closed, survives restart and requires manual resumption',async()=>{
 const fixture=await setup();
 try{
  const {state,other}=fixture;
  assert.equal(isPilotDisabled(state),false);
  assert.equal(disablePilot(state).newlyDisabled,true);
  assert.equal(disablePilot(state).newlyDisabled,false);
  assert.throws(()=>assertPilotEnabled(state),/disabled/);
  assert.throws(()=>resumePilot(state,{configuredPeerId:other.peerId}),/manual/);
  assert.equal(isPilotDisabled(state),true);
  assert.equal(resumePilot(state,{configuredPeerId:other.peerId,manualReview:true}).disabled,false);
  assert.equal(isPilotDisabled(state),false);
  disablePilot(state,{reason:'peer-revoked',revokedPeerId:other.peerId});
  assert.throws(()=>resumePilot(state,{configuredPeerId:other.peerId,manualReview:true}),/Revoked/);
  assert.equal(isPilotDisabled(state),true);
  const otherPeer=(await openPersistentPeerIdentity(path.join(fixture.root,'replacement'))).peerId;
  assert.equal(resumePilot(state,{configuredPeerId:otherPeer,manualReview:true}).disabled,false);
 }finally{rmSync(fixture.root,{recursive:true,force:true});}
});
test('malformed symlink stop marker fails closed even when dangling',async()=>{
 const fixture=await setup();
 try{
  symlinkSync('/does-not-exist',pilotStopPath(fixture.state));
  assert.equal(isPilotDisabled(fixture.state),true);
  assert.throws(()=>assertPilotEnabled(fixture.state));
  assert.throws(()=>resumePilot(fixture.state,{
   configuredPeerId:fixture.other.peerId,manualReview:true}));
 }finally{rmSync(fixture.root,{recursive:true,force:true});}
});
test('stop watcher detects a marker and invokes shutdown only once',async()=>{
 const fixture=await setup();
 let count=0;
 const watch=watchPilotStop(fixture.state,{intervalMs:25,onTrip:()=>count++});
 try{
  disablePilot(fixture.state);
  await new Promise(resolve=>setTimeout(resolve,90));
  assert.equal(count,1);
  assert.equal(watch.tripped(),true);
  assert.throws(()=>watch.check());
 }finally{watch.close();rmSync(fixture.root,{recursive:true,force:true});}
});
test('running pinned observer terminates after local control stop and refuses restart',
 {timeout:12000},async()=>{
 const fixture=await setup();
 const events=[];let stderr='';
 const processRun=spawn(process.execPath,['apps/p02c-host-pilot.mjs','observe',fixture.file],{
  cwd:path.resolve(import.meta.dirname,'..'),stdio:['ignore','pipe','pipe']
 });
 processRun.stdout.setEncoding('utf8');
 let buffer='';
 processRun.stdout.on('data',chunk=>{
  buffer+=chunk;
  while(buffer.includes('\n')){
   const p=buffer.indexOf('\n');
   try{events.push(JSON.parse(buffer.slice(0,p)));}catch{}
   buffer=buffer.slice(p+1);
  }
 });
 processRun.stderr.setEncoding('utf8');
 processRun.stderr.on('data',chunk=>{stderr+=chunk;});
 const completion=new Promise((resolve,reject)=>{
  processRun.once('error',reject);
  processRun.once('close',code=>resolve(code));
 });
 try{
  const end=Date.now()+6000;
  while(!events.some(e=>e.event==='started')&&Date.now()<end){
   if(processRun.exitCode!==null)throw Error('Observer exited early: '+stderr);
   await new Promise(resolve=>setTimeout(resolve,35));
  }
  assert.ok(events.some(e=>e.event==='started'),stderr);
  // The producer writes 'started' and health in adjacent stdout calls.
  // Stream events are asynchronous; wait for the health record explicitly.
  const healthDeadline=Date.now()+3000;
  while(!events.some(e=>e.event==='connection-health')&&Date.now()<healthDeadline){
   if(processRun.exitCode!==null)break;
   await new Promise(resolve=>setTimeout(resolve,25));
  }
  assert.ok(events.some(e=>e.event==='connection-health'),stderr);
  disablePilot(fixture.state,{reason:'peer-revoked',revokedPeerId:fixture.other.peerId});
  const code=await completion;
  assert.notEqual(code,0);
  assert.ok(events.some(e=>e.event==='local-shutdown'&&
    e.reason==='local-emergency-stop'));
  assert.equal(events.some(e=>e.event==='observer-complete'),false);
  const preflight=spawn(process.execPath,['apps/p02c-host-pilot.mjs','preflight',fixture.file],{
   cwd:path.resolve(import.meta.dirname,'..'),stdio:'ignore'
  });
  const status=await new Promise(resolve=>preflight.once('close',resolve));
  assert.notEqual(status,0,'revoked node must not silently restart');
 }finally{
  if(processRun.exitCode===null)processRun.kill('SIGKILL');
  await completion.catch(()=>{});
  rmSync(fixture.root,{recursive:true,force:true});
 }
});
