import { verifyEnvelope } from './protocol.mjs';

const BUCKET_MS_LIMIT = 60 * 60 * 1000;

/**
 * Research-only, in-memory confidential regional ingest.
 *
 * Only explicitly authorized signing keys are accepted. Transport must be
 * encrypted; incoming per-node observations must NEVER be gossiped publicly.
 * This is NOT an attestable location or anti-Sybil scheme.
 */
export class RegionalIngest {
  constructor({ authorizedKeys, now = () => Date.now(), maxAgeMs = 24*60*60_000,
    minOperators = 2, releaseDelayMs = 15 * 60_000 } = {}) {
    if (!(authorizedKeys instanceof Set) || authorizedKeys.size === 0)
      throw new TypeError('authorizedKeys must be a nonempty Set of signing key IDs');
    if (!Number.isSafeInteger(minOperators) || minOperators < 2 ||
        !Number.isSafeInteger(maxAgeMs) || maxAgeMs < 60_000 ||
        !Number.isSafeInteger(releaseDelayMs) || releaseDelayMs < 15 * 60_000)
      throw new RangeError('Invalid ingestion limits');
    this.authorizedKeys = new Set(authorizedKeys);
    this.now = now;
    this.maxAgeMs = maxAgeMs;
    this.minOperators = minOperators;
    this.releaseDelayMs = releaseDelayMs;
    this.highestSequence = new Map();
    this.seenIds = new Set();
    this.buckets = new Map();
  }

  ingest(envelope) {
    let body;
    try { body = verifyEnvelope(envelope); }
    catch { return { accepted: false, ack: false, code: 'invalid_signature_or_schema' }; }

    if (!this.authorizedKeys.has(body.keyId))
      return { accepted:false, ack:false, code:'unauthorized_signer' };

    const report = body.report;
    const end = report.bucketStart + report.bucketSeconds * 1000;
    const now = this.now();
    if (!Number.isSafeInteger(end) || end > now - this.releaseDelayMs ||
        end < now - this.maxAgeMs || report.bucketSeconds * 1000 > BUCKET_MS_LIMIT)
      return { accepted:false, ack:false, code:'outside_ingest_window' };

    // Retries after lost ACKs are safe. Only an already-accepted exact report ID
    // is acknowledged as a duplicate. Distinct report with same/old sequence
    // is rejected, not silently counted twice.
    if (this.seenIds.has(body.reportId))
      return { accepted:false, ack:true, duplicate:true, code:'already_accepted',
        reportId:body.reportId };

    if (body.sequence <= (this.highestSequence.get(body.keyId) ?? 0))
      return { accepted:false, ack:false, code:'stale_sequence' };

    // The region and time bucket must match exactly. Independent node identity
    // keys represent operators for the demo; this is NOT real-world uniqueness.
    const cellKey = JSON.stringify([report.area, report.bucketStart, report.bucketSeconds]);
    if (!this.buckets.has(cellKey)) this.buckets.set(cellKey, new Map());
    this.buckets.get(cellKey).set(body.keyId, report.activityIndex);
    this.seenIds.add(body.reportId);
    this.highestSequence.set(body.keyId, body.sequence);

    return { accepted:true, ack:true, code:'accepted', reportId:body.reportId };
  }

  /** Public-safe-ish synthetic demo summary; NOT a production privacy claim. */
  released() {
    const results = [];
    for (const [key, readings] of this.buckets) {
      if (readings.size < this.minOperators) continue;
      const [area, bucketStart, bucketSeconds] = JSON.parse(key);
      const mean = [...readings.values()].reduce((x,y)=>x+y,0) / readings.size;
      results.push({
        area, bucketStart, bucketSeconds,
        sources: readings.size, relativeBleActivity: Math.round(mean),
        status:'experimental_synthetic_only',
      });
    }
    return results.sort((a,b)=>a.bucketStart-b.bucketStart || a.area.localeCompare(b.area));
  }

  stats() {
    return { authorizedKeys: this.authorizedKeys.size, accepted: this.seenIds.size,
      eligibleRegionalBuckets: this.released().length };
  }
}
