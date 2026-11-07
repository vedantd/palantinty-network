import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {openPersistentPeerIdentity} from '../src/operator-identity.mjs';
import {openLocalIdentity} from '../src/identity.mjs';
import {signReport} from '../src/protocol.mjs';
import {DurableRegionalIngest} from '../src/durable-ingest.mjs';
import {operatorManifest} from '../src/operator-provisioning.mjs';
import {validateSyntheticIndexerConfig,readSyntheticIndexerConfig}
 from '../src/synthetic-indexer-config.mjs';

const region='synthetic-p01-operator';
const makeRoot=()=>mkdtempSync(path.join(tmpdir(),'palantiny-p01-'));
async function freePort(){
 const s=createServer();
 s.listen(0,'127.0.0.1');await once(s,'listening');
 const port=s.address().port;
 s.close();await once(s,'close');
 return port;
}
function config({mode,stateDir,signers,peerIds,listen,upstreamPeerId=null,upstreamManifest=null}){
 return {schema:'palantiny.synthetic-indexer-config.v1',
  syntheticOnly:true,mode,region,stateDir,listen,allowPrivateLan:false,
  authorizedSigningKeys:signers,trustedIndexerPeers:peerIds,
  upstreamPeerId,upstreamManifest};
}
test('config defaults to synthetic-only and rejects self-declared remote trust',async()=>{
 const root=makeRoot();
 try{
  const id=await openPersistentPeerIdentity(path.join(root,'id'));
  const manifest=operatorManifest({
   peerId:id.peerId,region,seedAddress:'/ip4/127.0.0.1/tcp/4001/p2p/'+id.peerId
  });
  const valid=config({mode:'sync-once',stateDir:root,signers:['a'.repeat(64)],
   peerIds:[id.peerId],listen:'/ip4/127.0.0.1/tcp/0',
   upstreamPeerId:id.peerId,upstreamManifest:manifest});
  assert.equal(validateSyntheticIndexerConfig(valid).syntheticOnly,true);
  assert.throws(()=>validateSyntheticIndexerConfig({...valid,syntheticOnly:false}),/non-synthetic/);
  assert.throws(()=>validateSyntheticIndexerConfig({...valid,
   upstreamPeerId:'another-peer'}),/pinned upstream/);
  assert.throws(()=>validateSyntheticIndexerConfig({...valid,
   listen:'/ip4/0.0.0.0/tcp/0'}));
  assert.throws(()=>validateSyntheticIndexerConfig({...valid,
   authorizedSigningKeys:['a'.repeat(64),'a'.repeat(64)]}),/non-synthetic/);
  const filename=path.join(root,'node.json');
  writeFileSync(filename,JSON.stringify(valid),{mode:0o600});
  assert.equal(readSyntheticIndexerConfig(filename).mode,'sync-once');
  chmodSync(filename,0o644);
  assert.throws(()=>readSyntheticIndexerConfig(filename),/private regular/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('two independently configured processes reconcile signed history without shared coordination',async()=>{
 const root=makeRoot();
 let source;
 try{
  const sourceDir=path.join(root,'source'),replicaDir=path.join(root,'replica');
  for(const dir of [sourceDir,replicaDir])mkdirSync(dir,{mode:0o700});
  const a=await openPersistentPeerIdentity(path.join(sourceDir,'operator-identity'));
  const b=await openPersistentPeerIdentity(path.join(replicaDir,'operator-identity'));
  const s1=openLocalIdentity(path.join(sourceDir,'signer-one'));
  const s2=openLocalIdentity(path.join(sourceDir,'signer-two'));
  const signers=[s1.keyId,s2.keyId];
  const now=Date.now();
  const sourceDb=new DurableRegionalIngest({
   dbPath:path.join(sourceDir,'index.sqlite'),
   authorizedKeys:new Set(signers)
  });
  for(const [i,key] of [s1,s2].entries()){
   const report={schema:'pulsemesh.activity.v1',area:region,
    bucketStart:Math.floor((now-35*60_000)/60_000)*60_000,
    bucketSeconds:60,activityIndex:20+i*10,metric:'ble_alias_activity'};
   assert.equal(sourceDb.ingest(signReport(report,key,1)).accepted,true);
  }
  sourceDb.close();
  const port=await freePort();
  const listen='/ip4/127.0.0.1/tcp/'+port;
  const manifest=operatorManifest({
   peerId:a.peerId,region,seedAddress:listen+'/p2p/'+a.peerId
  });
  const aFile=path.join(sourceDir,'config.json');
  const bFile=path.join(replicaDir,'config.json');
  writeFileSync(aFile,JSON.stringify(config({mode:'serve',stateDir:sourceDir,
   signers,peerIds:[b.peerId],listen})),{mode:0o600});
  writeFileSync(bFile,JSON.stringify(config({mode:'sync-once',stateDir:replicaDir,
   signers,peerIds:[a.peerId],listen:'/ip4/127.0.0.1/tcp/0',
   upstreamPeerId:a.peerId,upstreamManifest:manifest})),{mode:0o600});
  const nodeBinary=process.execPath;
  source=spawn(nodeBinary,['apps/operator-indexer.mjs',aFile],{
   cwd:new URL('..',import.meta.url).pathname,stdio:['ignore','pipe','pipe']
  });
  let sourceOutput='',sourceError='';
  source.stdout.on('data',v=>{sourceOutput+=v;});
  source.stderr.on('data',v=>{sourceError+=v;});
  const deadline=Date.now()+10_000;
  while(!sourceOutput.includes('"event":"ready"')&&Date.now()<deadline){
   assert.equal(source.exitCode,null,'Source exited: '+sourceError);
   await new Promise(resolve=>setTimeout(resolve,60));
  }
  assert.match(sourceOutput,/"event":"ready"/,sourceError);
  assert.match(sourceOutput,new RegExp(a.peerId));
  const replica=spawn(nodeBinary,['apps/operator-indexer.mjs',bFile],{
   cwd:new URL('..',import.meta.url).pathname,stdio:['ignore','pipe','pipe']
  });
  let output='',errors='';
  replica.stdout.on('data',v=>{output+=v;});
  replica.stderr.on('data',v=>{errors+=v;});
  const exit=await Promise.race([
   once(replica,'close').then(([code])=>code),
   new Promise((_,reject)=>setTimeout(()=>reject(Error('Replica timeout: '+errors)),16_000))
  ]);
  assert.equal(exit,0,errors+'\n'+output);
  const line=output.split('\n').find(x=>x.includes('"event":"sync-result"'));
  const result=JSON.parse(line);
  assert.equal(result.status,'consistent');
  assert.equal(result.accepted,2);
  assert.equal(result.peerId,b.peerId);
  assert.equal(source.exitCode,null);
 }finally{
  if(source?.exitCode===null){source.kill('SIGTERM');await once(source,'close');}
  rmSync(root,{recursive:true,force:true});
 }
});
