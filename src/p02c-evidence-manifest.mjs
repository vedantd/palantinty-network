import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';

const HEX = /^[a-f0-9]{64}$/;
const ID = /^[a-z][a-z0-9_-]{0,63}$/;
const FIELDS = ['schemaVersion', 'runId', 'hosts', 'artifacts', 'scenarios'];
const REQUIRED_SCENARIOS = ['baseline', 'partition', 'wrong-peer', 'revocation', 'restart', 'recovery'];

function assertFields(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(k => !keys.includes(k))) throw new Error(`invalid ${label} fields`);
}
function nonempty(value, label) {
  if (typeof value !== 'string' || value.length > 160 || !value.trim()) throw new Error(`invalid ${label}`);
}
function safeRelative(path) {
  if (typeof path !== 'string' || path.length > 180 || path.includes('\\') || path.includes('\0') ||
      isAbsolute(path) || path.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('unsafe artifact path');
}
export function validateP02cEvidenceManifest(manifest, root, { read = readFileSync } = {}) {
  assertFields(manifest, FIELDS, 'manifest');
  if (manifest.schemaVersion !== 1) throw new Error('unsupported evidence schema');
  nonempty(manifest.runId, 'runId');
  if (!Array.isArray(manifest.hosts) || manifest.hosts.length !== 2) throw new Error('exactly two host declarations required');
  const hostIds = new Set(), operatorIds = new Set();
  for (const host of manifest.hosts) {
    assertFields(host, ['hostId', 'operatorId', 'keyFingerprint', 'administrationStatement'], 'host');
    for (const k of ['hostId', 'operatorId', 'administrationStatement']) nonempty(host[k], k);
    if (!ID.test(host.hostId) || !ID.test(host.operatorId) || !HEX.test(host.keyFingerprint)) throw new Error('invalid host identity');
    hostIds.add(host.hostId); operatorIds.add(host.operatorId);
  }
  if (hostIds.size !== 2 || operatorIds.size !== 2 ||
      manifest.hosts[0].keyFingerprint === manifest.hosts[1].keyFingerprint) throw new Error('host/operator/key declarations must differ');
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length < 2 || manifest.artifacts.length > 40) throw new Error('invalid artifacts');
  const artifactIds = new Set(), artifactPaths = new Set();
  for (const artifact of manifest.artifacts) {
    assertFields(artifact, ['id', 'hostId', 'path', 'sha256'], 'artifact');
    if (!ID.test(artifact.id) || !hostIds.has(artifact.hostId) || !HEX.test(artifact.sha256)) throw new Error('invalid artifact metadata');
    safeRelative(artifact.path);
    if (artifactIds.has(artifact.id) || artifactPaths.has(artifact.path)) throw new Error('duplicate artifact');
    artifactIds.add(artifact.id); artifactPaths.add(artifact.path);
    const base = resolve(root), absolute = resolve(base, artifact.path);
    if (!relative(base, absolute) || relative(base, absolute).startsWith('..')) throw new Error('artifact escapes root');
    if (!lstatSync(absolute).isFile() || realpathSync(absolute) !== absolute) throw new Error('artifact must be regular non-symlink file');
    const bytes = read(absolute);
    if (bytes.length > 2_000_000) throw new Error('oversized artifact');
    if (createHash('sha256').update(bytes).digest('hex') !== artifact.sha256) throw new Error('artifact digest mismatch');
  }
  if (!Array.isArray(manifest.scenarios) || manifest.scenarios.length !== REQUIRED_SCENARIOS.length) throw new Error('incomplete scenario set');
  const scenarios = new Set();
  for (const scenario of manifest.scenarios) {
    assertFields(scenario, ['name', 'hostAArtifact', 'hostBArtifact', 'result'], 'scenario');
    if (!REQUIRED_SCENARIOS.includes(scenario.name) || scenarios.has(scenario.name) ||
        !artifactIds.has(scenario.hostAArtifact) || !artifactIds.has(scenario.hostBArtifact) ||
        scenario.result !== 'needs-independent-review') throw new Error('invalid scenario declaration');
    const a = manifest.artifacts.find(x => x.id === scenario.hostAArtifact);
    const b = manifest.artifacts.find(x => x.id === scenario.hostBArtifact);
    if (a.hostId === b.hostId) throw new Error('scenario must reference both hosts');
    scenarios.add(scenario.name);
  }
  return { structurallyComplete: true, verified: false, releaseGateChange: false, scenarioCount: scenarios.size };
}
