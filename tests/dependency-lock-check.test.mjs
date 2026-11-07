import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateLockedDependencies,verifyCurrentDependencyLock} from '../src/dependency-lock-check.mjs';
const p=JSON.parse(readFileSync('package.json','utf8'));
const l=JSON.parse(readFileSync('package-lock.json','utf8'));
const copy=x=>structuredClone(x);
test('repository lockfile pins all npm dependencies to integrity-checked tarballs',()=>{
 const result=verifyCurrentDependencyLock();
 assert.equal(result.lockfileVersion,3);
 assert.equal(result.name,'palantiny-network');
 assert.equal(result.pinnedPackages,131);
 assert.equal(result.approvedForProduction,false);
});
test('lockfile cannot silently drift, use non-NPM registries or omit integrity',()=>{
 const badRange=copy(l);badRange.packages[''].dependencies.libp2p='^999.0.0';
 assert.throws(()=>validateLockedDependencies(p,badRange),/range drift/);
 const badRegistry=copy(l);
 badRegistry.packages['node_modules/libp2p'].resolved='http://untrusted.local/file.tgz';
 assert.throws(()=>validateLockedDependencies(p,badRegistry),/Unpinned/);
 const badDigest=copy(l);delete badDigest.packages['node_modules/libp2p'].integrity;
 assert.throws(()=>validateLockedDependencies(p,badDigest),/Unpinned/);
 const missing=copy(l);delete missing.packages['node_modules/libp2p'];
 assert.throws(()=>validateLockedDependencies(p,missing),/Missing installed/);
});
