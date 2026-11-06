/**
 * Bounded local-only BLE activity windows.
 * Counts observed aliases, NOT individual humans or stable physical devices.
 */
export class ActivityAggregator {
  constructor({ windowMs = 60_000, maxAliases = 10_000, maxOpenWindows = 3 } = {}) {
    if (!Number.isSafeInteger(windowMs) || windowMs < 10_000) throw new RangeError('windowMs');
    if (!Number.isSafeInteger(maxAliases) || maxAliases < 1) throw new RangeError('maxAliases');
    if (!Number.isSafeInteger(maxOpenWindows) || maxOpenWindows < 1) throw new RangeError('maxOpenWindows');
    this.windowMs = windowMs;
    this.maxAliases = maxAliases;
    this.maxOpenWindows = maxOpenWindows;
    this.windows = new Map();
    this.closedThrough = -Infinity;
  }
  ingest(event) {
    if (event?.t !== 'ble' || !Number.isSafeInteger(event.ts) ||
        typeof event.id !== 'string' || !event.id ||
        !Number.isFinite(event.rssi) || event.rssi >= 0 || event.rssi < -127) return false;
    const start = Math.floor(event.ts / this.windowMs) * this.windowMs;
    if (start <= this.closedThrough) return false;
    let window = this.windows.get(start);
    if (!window) {
      if (this.windows.size >= this.maxOpenWindows) return false;
      window = { aliases: new Set(), complete: true };
      this.windows.set(start, window);
    }
    if (!window.aliases.has(event.id) && window.aliases.size >= this.maxAliases) {
      window.complete = false;
      return false;
    }
    window.aliases.add(event.id);
    return true;
  }
  markIncomplete() {
    for (const window of this.windows.values()) window.complete = false;
  }
  flush(now = Date.now()) {
    const results = [];
    for (const start of [...this.windows.keys()].sort((a,b) => a-b)) {
      if (start + this.windowMs > now) continue;
      const w = this.windows.get(start);
      results.push({ bucketStart: start, bucketSeconds: this.windowMs / 1000,
        observedAliases: w.aliases.size, complete: w.complete });
      this.windows.delete(start);
      this.closedThrough = Math.max(this.closedThrough, start);
    }
    return results;
  }
}
