import { ActivityAggregator } from './aggregator.mjs';
import { buildPublishableObservation } from './privacy.mjs';

/** In-memory local aggregate pipeline. No network I/O. */
export class LocalActivityPipeline {
  constructor({ windowMs = 60_000, policy = { consent: false }, clock = () => Date.now(),
    onReport = () => {}, maxPending = 120 } = {}) {
    if (!Number.isSafeInteger(maxPending) || maxPending < 1) throw new RangeError('maxPending');
    this.aggregator = new ActivityAggregator({ windowMs });
    this.clock = clock;
    this.policy = policy;
    this.onReport = onReport;
    this.maxPending = maxPending;
    this.connected = false;
    this.notBefore = Infinity;
    this.pending = [];
    this.metrics = { overflowDropped: 0, incompleteWindows: 0, policyRejected: 0, released: 0, revokedPending: 0 };
  }
  sensorConnected() {
    this.connected = true;
    const now = this.clock();
    // A window beginning before the sensor was connected is only partial.
    this.notBefore = Math.ceil(now / this.aggregator.windowMs) * this.aggregator.windowMs;
    this.aggregator.markIncomplete();
  }
  sensorDisconnected() {
    this.connected = false;
    this.aggregator.markIncomplete();
  }
  accept(event) {
    if (!this.connected || event?.t !== 'ble' || event.ts < this.notBefore) return false;
    const now = this.clock();
    // Reject wildly stale/future events at the boundary.
    if (event.ts > now + 5000 || event.ts < now - this.aggregator.windowMs * 3) return false;
    return this.aggregator.ingest(event);
  }
  tick() {
    const now = this.clock();
    for (const window of this.aggregator.flush(now)) {
      if (window.complete) this.pending.push(window);
      else this.metrics.incompleteWindows++;
    }
    if (this.pending.length > this.maxPending) {
      const excess = this.pending.length - this.maxPending;
      this.pending.splice(0, excess);
      this.metrics.overflowDropped += excess;
    }
    const remaining = [], released = [];
    for (const window of this.pending) {
      const outcome = buildPublishableObservation(window, this.policy, now);
      if (outcome.ok) {
        released.push(outcome.report);
        this.metrics.released++;
        this.onReport(outcome.report);
      } else if (outcome.reason === 'not_ready') remaining.push(window);
      else this.metrics.policyRejected++;
    }
    this.pending = remaining;
    return released;
  }
  diagnostics() {
    return Object.freeze({ ...this.metrics, pending: this.pending.length, connected: this.connected });
  }
  revokeConsent() {
    this.policy = { ...this.policy, consent: false };
    this.metrics.revokedPending += this.pending.length;
    this.pending.length = 0;
  }
}
