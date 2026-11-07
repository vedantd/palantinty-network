import { sign, verify, createPublicKey } from 'node:crypto';

const REGION = /^syn:[a-z0-9][a-z0-9-]{1,31}$/;
const PEER = /^[A-Za-z0-9]{20,120}$/;
const MAX_TTL = 15 * 60_000;
const fields = ['version','peerId','regions','issuedAt','expiresAt'];
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function plain(o, keys) {
  if (!o || typeof o !== 'object' || Array.isArray(o) || Object.keys(o).sort().join(',') !== [...keys].sort().join(',')) throw new Error('unexpected advertisement fields');
}
export function canonicalCoverage(payload, now = Date.now()) {
  plain(payload, fields);
  if (payload.version !== 1 || typeof payload.peerId !== 'string' || !PEER.test(payload.peerId)) throw new Error('invalid version or peer ID');
  if (!Array.isArray(payload.regions) || payload.regions.length < 1 || payload.regions.length > 16 ||
      payload.regions.some(r => typeof r !== 'string' || !REGION.test(r)) ||
      new Set(payload.regions).size !== payload.regions.length ||
      payload.regions.join('|') !== [...payload.regions].sort().join('|')) throw new Error('invalid synthetic regions');
  if (!Number.isSafeInteger(payload.issuedAt) || !Number.isSafeInteger(payload.expiresAt) ||
      payload.issuedAt > now || payload.expiresAt <= now ||
      payload.expiresAt - payload.issuedAt > MAX_TTL || payload.expiresAt <= payload.issuedAt) throw new Error('invalid advertisement lifetime');
  return Buffer.from(JSON.stringify(fields.map(k => payload[k])), 'utf8');
}
export function signPrivateCoverage(payload, privateKey, now = Date.now()) {
  const bytes = canonicalCoverage(payload, now);
  return { payload, signature: sign(null, bytes, privateKey).toString('base64') };
}
export function verifyPrivateCoverage(advert, approvedKeys, region, now = Date.now()) {
  try {
    plain(advert, ['payload','signature']);
    if (typeof advert.signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(advert.signature)) return false;
    const bytes = canonicalCoverage(advert.payload, now);
    if (!REGION.test(region) || !advert.payload.regions.includes(region)) return false;
    // Caller-provided local trust anchors only. No network-derived keys.
    const key = approvedKeys.get(advert.payload.peerId);
    if (!key) return false;
    const signature = Buffer.from(advert.signature, 'base64');
    if (signature.length !== 64 || signature.toString('base64') !== advert.signature) return false;
    return verify(null, bytes, createPublicKey(key), signature);
  } catch { return false; }
}
