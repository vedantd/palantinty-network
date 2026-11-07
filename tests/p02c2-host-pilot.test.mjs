import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync,writeFileSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {openPersistentPeerIdentity} from '../src/operator-identity.mjs';
import {validateP02cHostConfig,readP02cHostConfig} from '../src/p02c-host-config.mjs';

const projectRoot=path.resolve(import.meta.dirname,'..');
const runScript=path.join(projectRoot,'apps/p02c-host-pilot.mjs');
async function availablePort(){
 const server=net.createServer();
 server.listen(0,'127.0.0.1');
 await once(server,'listening');
 const port=server.address().port;
 await new Promise(resolve=>server.close(resolve));
 return port;
}
function launch(args){
 const child=spawn(processExec(),[runScript,...args],{
  cwd:projectRoot,env:process.env,stdio:['ignore','pipe','pipe']
 });
 const events=[];
 let stderr='';
 child.stdout.setEncoding('utf8');
 child.stderr.setEncoding('utf8');
 let text='';
 child.stdout.on('data',chunk=>{
  text+=chunk;
  while(text.includes('\n')){
   const idx=text.indexOf('\n');
   const line=text.slice(0,idx);text=text.slice(idx+1);
   try{events.push(JSON.parse(line));}catch{}
  }
 });
 child.stderr.on('data',chunk=>{stderr+=chunk;});
 const finished=new Promise((resolve,reject)=>{
  child.once('error',reject);
  child.once('close',code=>resolve({code,events,stderr}));
 });
 return {process:child,events,finished};
}
function processExec(){return process.execPath;}
async function until(fn,ms=10_000){
 const deadline=Date.now()+ms;
 while(Date.now()<deadline){
  const value=fn();
  if(value)return value;
  await new Promise(resolve=>setTimeout(resolve,50));
 }
 throw Error('Timed out waiting for pilot process event');
}
test('host config refuses unsafe or unpinned remote endpoints',async()=>{
 const peer=(await openPersistentPeerIdentity(
  mkdtempSync(path.join(tmpdir(),'p02c2-pin-')))).peerId;
 const base={schema:'palantiny.p02c-host-pilot.v1',syntheticOnly:true,
  pilotId:'two-host-drill',role:'observer',area:'synthetic-field-drill',
  stateDir:'/tmp/test-operator',listen:'/ip4/127.0.0.1/tcp/40123',
  allowPrivateLan:false,remoteIp:'127.0.0.1',remotePeerId:peer,
  remoteSeed:'/ip4/127.0.0.1/tcp/40124/p2p/'+peer};
 assert.equal(validateP02cHostConfig(base).syntheticOnly,true);
 for(const invalid of [
  {...base,syntheticOnly:false},
  {...base,area:'real-world'},
  {...base,listen:'/ip4/0.0.0.0/tcp/40123'},
  {...base,remoteIp:'8.8.8.8'},
  {...base,remoteSeed:'/ip4/127.0.0.1/tcp/40124/p2p/invalid'},
  {...base,remoteSeed:'/ip4/8.8.8.8/tcp/40124/p2p/'+peer},
  {...base,allowPrivateLan:true},
  {...base,role:'scanner'},
  {...base,unreviewed:true}
 ])assert.throws(()=>validateP02cHostConfig(invalid));
});
test('real separate host-runner processes retain PeerIDs, deliver synthetic report, then recover on restart',
 {timeout:65_000},async()=>{
 const root=mkdtempSync(path.join(tmpdir(),'p02c2-process-'));
 const running=[];
 try{
  const dirs=['observer','publisher'].map(role=>path.join(root,role));
  for(const dir of dirs)mkdirSync(dir,{mode:0o700});
  const identities=await Promise.all(dirs.map(dir=>
   openPersistentPeerIdentity(path.join(dir,'operator-identity'))));
  const ports=await Promise.all([availablePort(),availablePort()]);
  assert.notEqual(ports[0],ports[1]);
  const [a,b]=identities.map(x=>x.peerId);
  const configs=[
   {schema:'palantiny.p02c-host-pilot.v1',syntheticOnly:true,pilotId:'ci-p02c2',
    role:'observer',area:'synthetic-process-test',stateDir:dirs[0],
    listen:'/ip4/127.0.0.1/tcp/'+ports[0],allowPrivateLan:false,
    remoteIp:'127.0.0.1',remotePeerId:b,
    remoteSeed:'/ip4/127.0.0.1/tcp/'+ports[1]+'/p2p/'+b},
   {schema:'palantiny.p02c-host-pilot.v1',syntheticOnly:true,pilotId:'ci-p02c2',
    role:'publisher',area:'synthetic-process-test',stateDir:dirs[1],
    listen:'/ip4/127.0.0.1/tcp/'+ports[1],allowPrivateLan:false,
    remoteIp:'127.0.0.1',remotePeerId:a,
    remoteSeed:'/ip4/127.0.0.1/tcp/'+ports[0]+'/p2p/'+a}
  ];
  const names=dirs.map((dir,i)=>{
   const p=path.join(dir,'host-config.json');
   writeFileSync(p,JSON.stringify(configs[i]),{mode:0o600,flag:'wx'});
   assert.equal(readP02cHostConfig(p).remotePeerId,configs[i].remotePeerId);
   return p;
  });
  for(let round=1;round<=2;round++){
   const observer=launch(['observe',names[0]]);
   running.push(observer);
   await until(()=>observer.events.some(e=>e.event==='started'));
   const publisher=launch(['publish',names[1],String(round)]);
   running.push(publisher);
   const [received,sent]=await Promise.all([observer.finished,publisher.finished]);
   assert.equal(received.code,0,'observer error: '+received.stderr);
   assert.equal(sent.code,0,'publisher error: '+sent.stderr);
   const receipt=received.events.find(x=>x.event==='received-synthetic-report');
   const claimed=sent.events.find(x=>x.event==='synthetic-published-no-ack');
   assert.ok(receipt&&claimed);
   assert.equal(receipt.reportId,claimed.reportId);
   assert.equal(receipt.deliveryObserved,true);
   assert.equal(claimed.deliveryObserved,false);
   assert.equal(receipt.localPeerId,a);
   assert.equal(claimed.localPeerId,b);
   assert.equal(received.events.some(x=>x.realSensorData!==false),false);
  }
  assert.equal((await openPersistentPeerIdentity(
   path.join(dirs[0],'operator-identity'),{create:false})).peerId,a);
  assert.equal((await openPersistentPeerIdentity(
   path.join(dirs[1],'operator-identity'),{create:false})).peerId,b);
  // Closed listener must prevent claiming a successful remote receipt.
  const missing=launch(['publish',names[1],'3']);running.push(missing);
  const unreachable=await missing.finished;
  assert.notEqual(unreachable.code,0);
  assert.equal(unreachable.events.some(e=>e.deliveryObserved===true),false);
 }finally{
  for(const child of running)if(child.process.exitCode===null)child.process.kill('SIGKILL');
  await Promise.allSettled(running.map(x=>x.finished));
  rmSync(root,{recursive:true,force:true});
 }
});
