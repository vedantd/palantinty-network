import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertCiPolicy} from '../src/ci-policy-check.mjs';
const ci=readFileSync(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8');
test('checked-in CI uses immutable actions, read-only token and locked install',()=>{
 const x=assertCiPolicy(ci);
 assert.ok(x.actionCount>=3);
 assert.equal(x.token,'read-only');
});
test('privileged triggers, token escalation, mutable actions and unlocked installs are rejected',()=>{
 const variants=[
  ci.replace('  pull_request:', '  pull_request_target:'),
  ci.replace('  contents: read','  contents: write'),
  ci.replace(/actions\/checkout@[a-f0-9]{40}/,'actions/checkout@main'),
  ci.replace('npm ci --ignore-scripts','npm install --ignore-scripts'),
  ci.replace('npm run build:lock-check','echo skip-lock-check'),
  ci.replace('npm run release:check -- public-real-sensing --assert-blocked','echo bypass-release-check')
 ];
 for(const variant of variants) assert.throws(()=>assertCiPolicy(variant));
});
