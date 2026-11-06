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
    for (const window of this.aggregator.flush(now)) if (window.complete) this.pending.push(window);
    if (this.pending.length > this.maxPending) this.pending.splice(0, this.pending.length - this.maxPending);
    const remaining = [], released = [];
    for (const window of this.pending) {
      const outcome = buildPublishableObservation(window, this.policy, now);
      if (outcome.ok) {
        released.push(outcome.report);
        this.onReport(outcome.report);
      } else if (outcome.reason === 'not_ready') remaining.push(window);
    }
    this.pending = remaining;
    return released;
  }
  revokeConsent() {
    this.policy = { ...this.policy, consent: false };
    this.pending.length = 0;
  }
}
