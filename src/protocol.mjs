import { createHash, createPublicKey, sign, verify } from 'node:crypto';

/** Versioned, strictly allowlisted, canonical JSON protocol. */
const REPORT_KEYS = ['schema', 'area', 'bucketStart', 'bucketSeconds', 'activityIndex', 'metric'];
const BODY_KEYS = ['schema', 'keyId', 'publicKey', 'sequence', 'reportId', 'report'];
const ENVELOPE_KEYS = ['body', 'signature'];
const isShape = (x, fields) => x && typeof x === 'object' && !Array.isArray(x) &&
  Object.keys(x).length === fields.length && fields.every(k => Object.hasOwn(x, k));
const safeNonneg = n => Number.isSafeInteger(n) && n >= 0;
const b64url = /^[A-Za-z0-9_-]+$/;

export function canonicalReport(source) {
  if (!isShape(source, REPORT_KEYS) || source.schema !== 'pulsemesh.activity.v1' ||
      !/^[a-z0-9][a-z0-9._-]{2,63}$/.test(source.area) ||
      !safeNonneg(source.bucketStart) || !Number.isSafeInteger(source.bucketSeconds) ||
      source.bucketSeconds < 10 || source.bucketSeconds > 3600 ||
      !safeNonneg(source.activityIndex) || source.activityIndex > 1000000 ||
      source.activityIndex % 5 !== 0 || source.metric !== 'ble_alias_activity') {
    throw new Error('Report does not match the privacy-allowlisted protocol schema');
  }
  return {
    schema: source.schema, area: source.area, bucketStart: source.bucketStart,
    bucketSeconds: source.bucketSeconds, activityIndex: source.activityIndex, metric: source.metric
  };
}

function bodyFor(report, identity, sequence) {
  const payload = canonicalReport(report);
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error('Invalid sequence');
  const publicKey = identity.publicDer.toString('base64url');
  const keyId = createHash('sha256').update(identity.publicDer).digest('hex');
  const idMaterial = JSON.stringify([keyId, sequence, payload]);
  return {
    schema: 'pulsemesh.signed.v1', keyId, publicKey, sequence,
    reportId: createHash('sha256').update(idMaterial).digest('hex'), report: payload
  };
}

export function signReport(report, identity, sequence) {
  const body = bodyFor(report, identity, sequence);
  return { body, signature: sign(null, Buffer.from(JSON.stringify(body)), identity.privateKey).toString('base64url') };
}

/**
 * Verify cryptographic integrity and exact privacy boundary.
 * A valid signature is not proof of place, person counts, or measurement truth.
 */
export function verifyEnvelope(envelope) {
  if (!isShape(envelope, ENVELOPE_KEYS) || !isShape(envelope.body, BODY_KEYS))
    throw new Error('Invalid signed envelope fields');
  const b = envelope.body;
  if (b.schema !== 'pulsemesh.signed.v1' || !/^[a-f0-9]{64}$/.test(b.keyId) ||
      !/^[a-f0-9]{64}$/.test(b.reportId) ||
      typeof b.publicKey !== 'string' || !b64url.test(b.publicKey) ||
      typeof envelope.signature !== 'string' || !b64url.test(envelope.signature))
    throw new Error('Invalid signed envelope encoding');
  const pub = Buffer.from(b.publicKey, 'base64url');
  if (pub.length > 128 || pub.length < 40 || pub.toString('base64url') !== b.publicKey)
    throw new Error('Noncanonical key encoding');
  const sig = Buffer.from(envelope.signature, 'base64url');
  if (sig.length !== 64 || sig.toString('base64url') !== envelope.signature)
    throw new Error('Invalid signature encoding');
  const publicKey = createPublicKey({ key: pub, format: 'der', type: 'spki' });
  if (publicKey.asymmetricKeyType !== 'ed25519') throw new Error('Non-Ed25519 public key');
  const keyId = createHash('sha256').update(pub).digest('hex');
  if (keyId !== b.keyId) throw new Error('Key ID mismatch');
  const canonical = bodyFor(b.report, {publicDer: pub}, b.sequence);
  if (canonical.reportId !== b.reportId || JSON.stringify(canonical) !== JSON.stringify(b))
    throw new Error('Noncanonical body or incorrect report ID');
  if (!verify(null, Buffer.from(JSON.stringify(b)), publicKey, sig))
    throw new Error('Signature mismatch');
  return canonical;
}
