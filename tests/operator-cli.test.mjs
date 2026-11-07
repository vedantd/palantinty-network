import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {openPersistentPeerIdentity} from '../src/operator-identity.mjs';
const cwd=new URL('..',import.meta.url).pathname;
function invoke(script,file){
 return spawnSync(process.execPath,[script,file],{
  cwd,encoding:'utf8',timeout:10000
 });
}
test('operator manifests contain only public identity, region, and concrete private multiaddress',async()=>{
 const root=mkdtempSync(path.join(tmpdir(),'palantiny-p01b-'));
 try{
  const state=path.join(root,'operator');mkdirSync(state,{mode:0o700});
  const key=await openPersistentPeerIdentity(path.join(state,'operator-identity'));
  const trusted=(await openPersistentPeerIdentity(path.join(root,'remote'))).peerId;
  const original={schema:'palantiny.synthetic-indexer-config.v1',
    syntheticOnly:true,mode:'serve',region:'synthetic-p01b',
    stateDir:state,listen:'/ip4/127.0.0.1/tcp/40123',allowPrivateLan:false,
    authorizedSigningKeys:['a'.repeat(64)],trustedIndexerPeers:[trusted],
    upstreamPeerId:null,upstreamManifest:null};
  const configFile=path.join(root,'config.json');
  writeFileSync(configFile,JSON.stringify(original),{mode:0o600});
  const preflight=invoke('apps/operator-preflight.mjs',configFile);
  assert.equal(preflight.status,0,preflight.stderr);
  const status=JSON.parse(preflight.stdout);
  assert.equal(status.peerId,key.peerId);
  assert.equal(status.publicTestnetReady,false);
  const manifest=invoke('apps/operator-manifest.mjs',configFile);
  assert.equal(manifest.status,0,manifest.stderr);
  const doc=JSON.parse(manifest.stdout);
  assert.equal(doc.peerId,key.peerId);
  assert.equal(doc.seedAddress,'/ip4/127.0.0.1/tcp/40123/p2p/'+key.peerId);
  assert.deepEqual(Object.keys(doc).sort(),
   ['peerId','region','schema','seedAddress']);
  assert.equal(manifest.stdout.includes('privateKey'),false);
  assert.equal(manifest.stdout.includes('signer'),false);
  writeFileSync(configFile,JSON.stringify({...original,
    listen:'/ip4/127.0.0.1/tcp/0'}),{mode:0o600});
  assert.notEqual(invoke('apps/operator-manifest.mjs',configFile).status,0);
  assert.notEqual(invoke('apps/operator-preflight.mjs',configFile).status,0);
  writeFileSync(configFile,JSON.stringify({...original,syntheticOnly:false}),{mode:0o600});
  assert.notEqual(invoke('apps/operator-manifest.mjs',configFile).status,0);
  assert.notEqual(invoke('apps/operator-preflight.mjs',configFile).status,0);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('synthetic seed creates six signed reports and refuses an existing database',()=>{
 const root=mkdtempSync(path.join(tmpdir(),'palantiny-p01b-seed-'));
 try{
  const state=path.join(root,'state');mkdirSync(state,{mode:0o700});
  const args=['apps/operator-seed-synthetic.mjs',state,'synthetic-test-site'];
  const first=spawnSync(process.execPath,args,{cwd,encoding:'utf8',timeout:10000});
  assert.equal(first.status,0,first.stderr);
  const result=JSON.parse(first.stdout);
  assert.equal(result.syntheticOnly,true);
  assert.equal(result.accepted,6);
  assert.equal(result.authorizedSigningKeys.length,2);
  assert.equal(first.stdout.includes('privateKey'),false);
  const second=spawnSync(process.execPath,args,{cwd,encoding:'utf8',timeout:10000});
  assert.notEqual(second.status,0);
  assert.match(second.stderr,/existing index database/);
  const wrong=spawnSync(process.execPath,[
   'apps/operator-seed-synthetic.mjs',state,'public-region'
  ],{cwd,encoding:'utf8',timeout:10000});
  assert.notEqual(wrong.status,0);
 }finally{rmSync(root,{recursive:true,force:true});}
});
