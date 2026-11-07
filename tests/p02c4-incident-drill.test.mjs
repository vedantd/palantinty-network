import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {openPersistentPeerIdentity} from '../src/operator-identity.mjs';
import {disablePilot,resumePilot} from '../src/p02c-pilot-operations.mjs';
import {reviewP02cIncidentDrill} from '../src/p02c-incident-review.mjs';

const root=path.resolve(import.meta.dirname,'..');
const script=path.join(root,'apps/p02c-host-pilot.mjs');
async function port(){
 const s=net.createServer();s.listen(0,'127.0.0.1');
 await once(s,'listening');const p=s.address().port;
 await new Promise(resolve=>s.close(resolve));return p;
}
function launch(role,filename,round){
 const args=[script,role,filename];
 if(round!==undefined)args.push(String(round));
 const child=spawn(process.execPath,args,{cwd:root,stdio:['ignore','pipe','pipe']});
 const events=[];let stderr='',pending='';
 child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
 child.stdout.on('data',chunk=>{
  pending+=chunk;let end;
  while((end=pending.indexOf('\n'))>=0){
   const line=pending.slice(0,end);pending=pending.slice(end+1);
   try{events.push(JSON.parse(line));}catch{}
  }
 });
 child.stderr.on('data',chunk=>{stderr+=chunk;});
 const finished=new Promise((resolve,reject)=>{
  child.once('error',reject);
  child.once('close',code=>resolve({code,events,stderr}));
 });
 return {child,events,finished};
}
async function waitForEvent(job,event,ms=7000){
 const deadline=Date.now()+ms;
 while(Date.now()<deadline){
  if(job.events.some(e=>e.event===event))return;
  if(job.child.exitCode!==null)throw Error(event+' not seen: process exited');
  await new Promise(resolve=>setTimeout(resolve,30));
 }
 throw Error('Timed out waiting for '+event);
}
test('reviewer rejects fabricated outage, reused IDs and replayed recovery',()=>{
 const a='12D3KooW'+'a'.repeat(44),b='12D3KooW'+'b'.repeat(44);
 const base=(role,local,remote,event,props={})=>({
  schema:'palantiny.p02c-pilot-evidence.v1',syntheticOnly:true,
  realSensorData:false,publicTestnetReady:false,pilotId:'private-test',
  role,localPeerId:local,remotePeerId:remote,event,...props
 });
 const receipts=number=>{
  const id=number.repeat(64);
  return {
   observer:[base('observer',a,b,'started'),base('observer',a,b,
    'received-synthetic-report',{reportId:id,deliveryObserved:true})],
   publisher:[base('publisher',b,a,'started'),base('publisher',b,a,
    'synthetic-published-no-ack',{reportId:id,delivered:false,deliveryObserved:false})]
  };
 };
 const first=receipts('a'),next=receipts('b');
 const outage=[base('publisher',b,a,'started')];
 const input={baselineObserver:first.observer,baselinePublisher:first.publisher,
  outagePublisher:outage,outageExitCode:1,
  recoveryObserver:next.observer,recoveryPublisher:next.publisher};
 const valid=reviewP02cIncidentDrill(input);
 assert.equal(valid.localDrillSequenceConsistent,true);
 assert.equal(valid.remoteHostsVerified,false);
 assert.equal(valid.overlayFirewallVerified,false);
 assert.equal(valid.publicTestnetReady,false);
 assert.throws(()=>reviewP02cIncidentDrill({...input,outageExitCode:0}));
 assert.throws(()=>reviewP02cIncidentDrill({...input,
  outagePublisher:[...outage,first.publisher[1]]}));
 assert.throws(()=>reviewP02cIncidentDrill({...input,
  recoveryObserver:first.observer,recoveryPublisher:first.publisher}));
 assert.throws(()=>reviewP02cIncidentDrill({...input,
  recoveryPublisher:next.publisher.map(e=>({...e,localPeerId:a}))}));
 assert.throws(()=>reviewP02cIncidentDrill({...input,
  outagePublisher:outage.map(e=>({...e,realSensorData:true}))}));
});

test('real process drill: baseline, outage, restart, revocation and wrong peer',
 {timeout:65000},async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'p02c4-'));
 const jobs=[];
 try{
  const obsDir=path.join(dir,'observer'),pubDir=path.join(dir,'publisher');
  for(const p of [obsDir,pubDir])mkdirSync(p,{mode:0o700});
  const [obs,pub]=await Promise.all([obsDir,pubDir].map(d=>
   openPersistentPeerIdentity(path.join(d,'operator-identity'))));
  const [op,pp]=await Promise.all([port(),port()]);
  if(op===pp)throw Error('Test needs distinct loopback ports');
  const area='synthetic-incident-drill';
  const files=[obsDir,pubDir].map((d,i)=>{
   const local=i===0?obs:pub,remote=i===0?pub:obs;
   const listenPort=i===0?op:pp,remotePort=i===0?pp:op;
   const data={schema:'palantiny.p02c-host-pilot.v1',syntheticOnly:true,
    pilotId:'ci-incident-drill',role:i===0?'observer':'publisher',
    area,stateDir:d,listen:'/ip4/127.0.0.1/tcp/'+listenPort,
    allowPrivateLan:false,remoteIp:'127.0.0.1',
    remotePeerId:remote.peerId,
    remoteSeed:'/ip4/127.0.0.1/tcp/'+remotePort+'/p2p/'+remote.peerId};
   const p=path.join(d,'config.json');
   writeFileSync(p,JSON.stringify(data),{mode:0o600});
   return p;
  });
  async function successfulRound(n){
   const observer=launch('observe',files[0]);jobs.push(observer);
   await waitForEvent(observer,'started');
   const publisher=launch('publish',files[1],n);jobs.push(publisher);
   const [o,p]=await Promise.all([observer.finished,publisher.finished]);
   assert.equal(o.code,0,o.stderr);
   assert.equal(p.code,0,p.stderr);
   return {observer:o.events,publisher:p.events};
  }
  const baseline=await successfulRound(1);
  const outage=launch('publish',files[1],2);jobs.push(outage);
  const outageResult=await outage.finished;
  assert.notEqual(outageResult.code,0,'publisher must fail when observer is absent');
  assert.ok(outageResult.events.some(e=>e.event==='started'));
  const recovery=await successfulRound(3);
  const verdict=reviewP02cIncidentDrill({
   baselineObserver:baseline.observer,baselinePublisher:baseline.publisher,
   outagePublisher:outageResult.events,outageExitCode:outageResult.code,
   recoveryObserver:recovery.observer,recoveryPublisher:recovery.publisher
  });
  assert.equal(verdict.baselineReceipts,1);
  assert.equal(verdict.recoveryReceipts,1);
  assert.equal(verdict.persistentPeerIdsMatch,true);
  assert.equal(verdict.remoteHostsVerified,false);
  const oldId=pub.peerId;
  disablePilot(obsDir,{reason:'peer-revoked',revokedPeerId:oldId});
  const blocked=launch('observe',files[0]);jobs.push(blocked);
  assert.notEqual((await blocked.finished).code,0);
  assert.throws(()=>resumePilot(obsDir,{configuredPeerId:oldId,manualReview:true}));
  // A deliberately wrong private pin must not establish connectivity.
  const replacement=await openPersistentPeerIdentity(path.join(dir,'replacement'));
  const wrong={...JSON.parse((await import('node:fs')).readFileSync(files[1],'utf8')),
   remotePeerId:replacement.peerId,
   remoteSeed:'/ip4/127.0.0.1/tcp/'+op+'/p2p/'+replacement.peerId};
  const wrongFile=path.join(pubDir,'wrong-pin.json');
  writeFileSync(wrongFile,JSON.stringify(wrong),{mode:0o600});
  const denied=launch('publish',wrongFile,4);jobs.push(denied);
  assert.notEqual((await denied.finished).code,0);
 }finally{
  for(const job of jobs)if(job.child.exitCode===null)job.child.kill('SIGKILL');
  await Promise.allSettled(jobs.map(job=>job.finished));
  rmSync(dir,{recursive:true,force:true});
 }
});
