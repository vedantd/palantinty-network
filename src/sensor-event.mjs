/**
 * Palantiny v1 local-only event parser.
 * Values are private. Never pass results directly to a network publisher.
 */
export function parseSensorEvent(line) {
  let value;
  try { value = typeof line === 'string' ? JSON.parse(line) : line; }
  catch { return null; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (!Number.isSafeInteger(value.ts) || value.ts < 0) return null;
  if (value.t === 'ble') {
    if (typeof value.id !== 'string' || value.id.length < 1 || value.id.length > 256) return null;
    if (typeof value.rssi !== 'number' || !Number.isFinite(value.rssi) || value.rssi < -127 || value.rssi >= 0) return null;
    return { t: 'ble', ts: value.ts, id: value.id, rssi: value.rssi };
  }
  if (value.t === 'status') {
    return { t: 'status', ts: value.ts, bluetooth: value.bluetooth === 'on' ? 'on' : 'unknown' };
  }
  // Ignore Wi-Fi records, including private SSIDs, BSSIDs and fingerprints.
  return null;
}
