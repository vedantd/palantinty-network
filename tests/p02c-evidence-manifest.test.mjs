import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { validateP02cEvidenceManifest } from '../src/p02c-evidence-manifest.mjs';

const names = ['baseline', 'partition', 'wrong-peer', 'revocation', 'restart', 'recovery'];
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'p02c-evidence-'));
  const artifacts = ['a', 'b'].map((hostId, i) => {
    const path = hostId + '.txt', bytes = Buffer.from('synthetic fixture ' + hostId);
    writeFileSync(join(dir, path), bytes);
    return { id: hostId + 'log', hostId, path, sha256: createHash('sha256').update(bytes).digest('hex') };
  });
  const hosts = ['a', 'b'].map((hostId, i) => ({
    hostId, operatorId: 'operator-' + hostId, keyFingerprint: String(i + 1).repeat(64),
    administrationStatement: 'Fixture only; not real operator evidence'
  }));
  const manifest = { schemaVersion: 1, runId: 'fixture-only', hosts, artifacts,
    scenarios: names.map(name => ({ name, hostAArtifact: 'alog', hostBArtifact: 'blog', result: 'needs-independent-review' })) };
  return { dir, manifest, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
test('synthetic fixture is structurally complete but never verified', () => {
  const f = fixture();
  try { assert.deepEqual(validateP02cEvidenceManifest(f.manifest, f.dir),
    { structurallyComplete: true, verified: false, releaseGateChange: false, scenarioCount: 6 }); }
  finally { f.cleanup(); }
});
for (const [name, mutate] of [
  ['same operator', m => { m.hosts[1].operatorId = m.hosts[0].operatorId; }],
  ['same key', m => { m.hosts[1].keyFingerprint = m.hosts[0].keyFingerprint; }],
  ['missing scenario', m => { m.scenarios.pop(); }],
  ['same host evidence', m => { m.scenarios[0].hostBArtifact = 'alog'; }],
  ['false verified claim', m => { m.scenarios[0].result = 'verified'; }],
  ['path traversal', m => { m.artifacts[0].path = '../outside'; }],
  ['digest mismatch', m => { m.artifacts[0].sha256 = '0'.repeat(64); }],
  ['unknown fields', m => { m.releaseGate = 'verified'; }],
  ['duplicate artifact', m => { m.artifacts[1].id = m.artifacts[0].id; }]
]) test('rejects ' + name, () => {
  const f = fixture();
  try { mutate(f.manifest); assert.throws(() => validateP02cEvidenceManifest(f.manifest, f.dir)); }
  finally { f.cleanup(); }
});
