import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('CI uses immutable action SHAs with least-privilege token and lockfile installs',()=>{
 const ci=readFileSync('.github/workflows/ci.yml','utf8');
 assert.match(ci,/permissions:\s*\n\s*contents: read/);
 assert.doesNotMatch(ci,/uses:\s*actions\/(?:checkout|setup-node|upload-artifact)@v[0-9]+/);
 for(const action of ['checkout','setup-node','upload-artifact']){
  assert.match(ci,new RegExp('uses: actions/'+action+'@[a-f0-9]{40}'));
 }
 assert.match(ci,/npm ci --ignore-scripts --no-audit --no-fund/);
 assert.match(ci,/npm run build:lock-check/);
});
test('CI generates a bounded lock-derived CycloneDX SBOM as a nonrelease artifact',()=>{
 const ci=readFileSync('.github/workflows/ci.yml','utf8');
 assert.match(ci,/npm sbom --sbom-format=cyclonedx --omit=dev/);
 assert.match(ci,/h1b-node-locked-cyclonedx-sbom/);
 assert.match(ci,/if-no-files-found: error/);
 assert.doesNotMatch(ci,/\bcontents:\s*write\b/);
});
