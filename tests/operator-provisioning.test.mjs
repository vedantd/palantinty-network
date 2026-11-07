import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,chmodSync,readFileSync,symlinkSync,writeFileSync,statSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {openPersistentPeerIdentity} from '../src/operator-identity.mjs';
import {operatorManifest,validatePinnedManifest,readPinnedOperatorFile}
 from '../src/operator-provisioning.mjs';
import {createPrivateNode} from '../src/private-transport.mjs';

async function withTemp(fn) {
 const root=mkdtempSync(path.join(tmpdir(),'palantiny-operator-'));
 try{return await fn(root);}
 finally{rmSync(root,{recursive:true,force:true});}
}
test('libp2p Peer ID survives shutdown/restart with same Ed25519 key',()=>withTemp(async(root)=>{
 const directory=path.join(root,'private');
 const first=await openPersistentPeerIdentity(directory);
 assert.equal(statSync(directory).mode&0o777,0o700);
 assert.equal(statSync(first.keyFile).mode&0o777,0o600);
 const firstBytes=readFileSync(first.keyFile);
 let node=await createPrivateNode({privateKey:first.privateKey});
 assert.equal(node.peerId.toString(),first.peerId);
 await node.stop();
 const second=await openPersistentPeerIdentity(directory,{create:false});
 assert.equal(second.peerId,first.peerId);
 assert.deepEqual(readFileSync(second.keyFile),firstBytes);
 node=await createPrivateNode({privateKey:second.privateKey});
 assert.equal(node.peerId.toString(),first.peerId);
 await node.stop();
}));
test('missing identities fail closed when create=false, no automatic key replacement',()=>withTemp(async(root)=>{
 await assert.rejects(()=>openPersistentPeerIdentity(path.join(root,'missing'),{create:false}));
 const dir=path.join(root,'private');
 const first=await openPersistentPeerIdentity(dir);
 writeFileSync(first.keyFile,'not-a-valid-key');
 await assert.rejects(()=>openPersistentPeerIdentity(dir),/Invalid identity key|protobuf|Unexpected|unexpected|invalid|Invalid/);
}));
test('directory and file permissions plus symlink rejection',()=>withTemp(async(root)=>{
 const dir=path.join(root,'private');
 const first=await openPersistentPeerIdentity(dir);
 chmodSync(first.keyFile,0o644);
 await assert.rejects(()=>openPersistentPeerIdentity(dir),/private 0600/);
 chmodSync(first.keyFile,0o600);
 chmodSync(dir,0o755);
 await assert.rejects(()=>openPersistentPeerIdentity(dir),/private 0700/);
 chmodSync(dir,0o700);
 const link=path.join(root,'alias');
 symlinkSync(dir,link,'dir');
 await assert.rejects(()=>openPersistentPeerIdentity(link),/symlink/);
}));
test('verified operator manifest pins exact public key and coarse region',()=>withTemp(async(root)=>{
 const {peerId}=await openPersistentPeerIdentity(path.join(root,'private'));
 const region='synthetic-m10-pilot';
 const seedAddress='/ip4/10.20.0.5/tcp/4001/p2p/'+peerId;
 const doc=operatorManifest({peerId,region,seedAddress});
 assert.equal(validatePinnedManifest(doc,{expectedPeerId:peerId,region}).peerId,peerId);
 assert.throws(()=>validatePinnedManifest(doc,{expectedPeerId:'another-operator',region}),/Unverified/);
 assert.throws(()=>validatePinnedManifest(doc,{expectedPeerId:peerId,region:'other'}),/Unverified/);
 assert.throws(()=>operatorManifest({peerId,region,seedAddress:'/ip4/8.8.8.8/tcp/4001/p2p/'+peerId}));
 assert.throws(()=>operatorManifest({peerId,region,seedAddress:'/ip4/10.20.0.5/tcp/4001/p2p/other'}));
 assert.throws(()=>validatePinnedManifest({...doc,privateKey:'secret'},
   {expectedPeerId:peerId,region}),/schema/);
 const config=path.join(root,'pinned.json');
 writeFileSync(config,JSON.stringify(doc),{mode:0o600});
 assert.equal(readPinnedOperatorFile(config,{expectedPeerId:peerId,region}).peerId,peerId);
 chmodSync(config,0o644);
 assert.throws(()=>readPinnedOperatorFile(config,{expectedPeerId:peerId,region}),/private regular file/);
}));
