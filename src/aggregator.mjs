/**
 * Bounded local-only BLE activity windows.
 * Counts observed aliases, NOT individual humans or stable physical devices.
 *
 * Completed windows are reduced to numeric-only summaries if the scan runs
 * longer than maxOpenWindows without calling flush(). This avoids the
 * observed "accepted count stops after 3 windows" single-shot scan bug.
 */
export class ActivityAggregator {
  constructor({ windowMs = 60_000, maxAliases = 10_000, maxOpenWindows = 3,
    maxClosedWindows = 180 } = {}) {
    for (const [field, value, min] of [
      ['windowMs', windowMs, 10_000], ['maxAliases', maxAliases, 1],
      ['maxOpenWindows', maxOpenWindows, 1], ['maxClosedWindows', maxClosedWindows, 1]
    ]) {
      if (!Number.isSafeInteger(value) || value < min) throw new RangeError(field);
    }
    this.windowMs = windowMs;
    this.maxAliases = maxAliases;
    this.maxOpenWindows = maxOpenWindows;
    this.maxClosedWindows = maxClosedWindows;
    this.windows = new Map();
    this.closed = [];
    this.closedThrough = -Infinity;
    this.droppedClosedWindows = 0;
  }

  summarize(start, window) {
    return Object.freeze({
      bucketStart: start,
      bucketSeconds: this.windowMs / 1000,
      observedAliases: window.aliases.size,
      complete: window.complete,
    });
  }

  // A numeric summary is safe to retain locally without retaining an
  // additional set of private aliases. Retention is bounded and observable.
  retireOldest() {
    const oldest = Math.min(...this.windows.keys());
    const summary = this.summarize(oldest, this.windows.get(oldest));
    this.windows.delete(oldest);
    this.closedThrough = Math.max(this.closedThrough, oldest);
    if (this.closed.length === this.maxClosedWindows) {
      this.closed.shift();
      this.droppedClosedWindows++;
    }
    this.closed.push(summary);
  }

  ingest(event) {
    if (event?.t !== 'ble' || !Number.isSafeInteger(event.ts) ||
        typeof event.id !== 'string' || !event.id ||
        !Number.isFinite(event.rssi) || event.rssi >= 0 || event.rssi < -127) return false;
    const start = Math.floor(event.ts / this.windowMs) * this.windowMs;
    if (start <= this.closedThrough) return false;
    let window = this.windows.get(start);
    if (!window) {
      if (this.windows.size >= this.maxOpenWindows) {
        const oldest = Math.min(...this.windows.keys());
        // Only retire an earlier, finished bucket; a late event must not
        // evict a newer active window.
        if (start <= oldest) return false;
        this.retireOldest();
      }
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
    const result = [], retained = [];
    for (const summary of this.closed) {
      if (summary.bucketStart + this.windowMs <= now) result.push(summary);
      else retained.push(summary);
    }
    this.closed = retained;
    for (const start of [...this.windows.keys()].sort((a, b) => a - b)) {
      if (start + this.windowMs > now) continue;
      const window = this.windows.get(start);
      result.push(this.summarize(start, window));
      this.windows.delete(start);
      this.closedThrough = Math.max(this.closedThrough, start);
    }
    return result.sort((a, b) => a.bucketStart - b.bucketStart);
  }
}
