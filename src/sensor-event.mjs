/**
 * Palantiny v1 local-only event parser.
 * Values are private. Never pass results directly to a network publisher.
 */
const BLUETOOTH_STATES = new Set(['on', 'off', 'denied', 'unsupported', 'starting', 'unknown']);
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
    // Palantiny publishes independent partial status events: for example,
    // {t:'status', wifi:'on'} has no new information about Bluetooth.
    // Never synthesize a Bluetooth state when the field was omitted.
    const status = { t: 'status', ts: value.ts };
    if (BLUETOOTH_STATES.has(value.bluetooth)) status.bluetooth = value.bluetooth;
    // Location and Wi-Fi fields (including SSIDs/BSSIDs) never enter this parser output.
    return status;
  }
  // Ignore Wi-Fi records, including private SSIDs, BSSIDs and fingerprints.
  return null;
}
