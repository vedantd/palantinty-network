/**
 * Single explicit aggregate export boundary. No observed device IDs, names,
 * manufacturer payloads, Wi-Fi fingerprints or raw sightings may be published.
 * Quantization and thresholds are NOT an anonymity guarantee.
 */
export function buildPublishableObservation(window, policy, now = Date.now()) {
  if (policy?.consent !== true) return { ok: false, reason: 'opt_in_required' };
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(policy.area ?? ''))
    return { ok: false, reason: 'invalid_coarse_area' };
  const minAliases = policy.minAliases ?? 20;
  const delayMs = policy.delayMs ?? 15 * 60_000;
  if (!Number.isSafeInteger(minAliases) || minAliases < 20 ||
      !Number.isSafeInteger(delayMs) || delayMs < 0)
    return { ok: false, reason: 'invalid_policy' };
  if (!window?.complete || !Number.isSafeInteger(window.bucketStart) ||
      !Number.isSafeInteger(window.bucketSeconds) || window.bucketSeconds < 10 ||
      !Number.isSafeInteger(window.observedAliases) || window.observedAliases < 0)
    return { ok: false, reason: 'invalid_window' };
  if (window.bucketStart + window.bucketSeconds * 1000 + delayMs > now)
    return { ok: false, reason: 'not_ready' };
  if (window.observedAliases < minAliases)
    return { ok: false, reason: 'below_threshold' };
  return { ok: true, report: Object.freeze({
    schema: 'pulsemesh.activity.v1',
    area: policy.area,
    bucketStart: window.bucketStart,
    bucketSeconds: window.bucketSeconds,
    activityIndex: Math.floor(window.observedAliases / 5) * 5,
    metric: 'ble_alias_activity'
  }) };
}
