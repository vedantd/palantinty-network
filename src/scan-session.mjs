import { ActivityAggregator } from './aggregator.mjs';
import { parseSensorEvent } from './sensor-event.mjs';
import { buildPublishableObservation } from './privacy.mjs';

/**
 * Local-only diagnostic session. No network or filesystem writes.
 * Sensor identifiers are used only in bounded in-memory sets.
 */
export class ScanSession {
  constructor({ clock = () => Date.now(), windowSeconds = 20,
    maxSessionAliases = 10000 } = {}) {
    if (!Number.isSafeInteger(windowSeconds) || windowSeconds < 10 || windowSeconds > 3600)
      throw new RangeError('windowSeconds must be 10..3600');
    if (!Number.isSafeInteger(maxSessionAliases) || maxSessionAliases < 1)
      throw new RangeError('maxSessionAliases');
    this.clock = clock;
    this.windowMs = windowSeconds * 1000;
    this.aggregator = new ActivityAggregator({ windowMs: this.windowMs });
    this.maxSessionAliases = maxSessionAliases;
    this.sessionAliases = new Set();
    this.aliasCountCapped = false;
    this.radio = 'unknown';
    this.connected = false;
    this.startTime = null;
    this.notBefore = Infinity;
    this.accepted = 0;
    this.rejected = 0;
    this.droppedLines = 0;
    this.rssiMin = null;
    this.rssiMax = null;
    this.closedWindows = [];
    this.aborted = false;
  }
  onConnected() {
    if (this.startTime !== null) throw new Error('single scanner connection only');
    this.connected = true;
    this.startTime = this.clock();
    // Never report the partially sampled first clock-aligned bucket.
    this.notBefore = Math.ceil(this.startTime / this.windowMs) * this.windowMs;
  }
  onDisconnected() {
    if (this.connected) {
      this.tick();
      this.aggregator.markIncomplete();
      this.connected = false;
      this.aborted = true;
    }
  }
  onDroppedLine() { this.droppedLines++; }
  onLine(line) {
    const event = parseSensorEvent(line);
    if (!event) return;
    if (event.t === 'status') { this.radio = event.bluetooth; return; }
    if (!this.connected || event.ts < this.notBefore) return;
    const now = this.clock();
    if (event.ts < now - 3 * this.windowMs || event.ts > now + 5000) {
      this.rejected++; return;
    }
    if (!this.aggregator.ingest(event)) { this.rejected++; return; }
    this.accepted++;
    if (!this.sessionAliases.has(event.id)) {
      if (this.sessionAliases.size < this.maxSessionAliases) this.sessionAliases.add(event.id);
      else this.aliasCountCapped = true;
    }
    this.rssiMin = this.rssiMin === null ? event.rssi : Math.min(this.rssiMin, event.rssi);
    this.rssiMax = this.rssiMax === null ? event.rssi : Math.max(this.rssiMax, event.rssi);
  }
  tick() {
    const now = this.clock();
    for (const w of this.aggregator.flush(now)) {
      if (!w.complete) continue;
      // A LOCAL diagnostic may be instantaneous. The normal delayed policy is
      // independently evaluated; this module does not publish reports.
      const policy = { consent: true, area: 'local-mac-scan' };
      const diagnostic = buildPublishableObservation(w, { ...policy, delayMs: 0 }, now);
      const defaultGate = buildPublishableObservation(w, policy, now);
      this.closedWindows.push({
        bucketStart: w.bucketStart,
        bucketSeconds: w.bucketSeconds,
        observedAliases: w.observedAliases,
        activityIndex: diagnostic.ok ? diagnostic.report.activityIndex : null,
        localGate: diagnostic.ok ? 'ok' : diagnostic.reason,
        defaultGate: defaultGate.ok ? 'ready' : defaultGate.reason
      });
    }
  }
  progress() {
    return {
      seconds: this.startTime === null ? 0 : Math.floor((this.clock() - this.startTime) / 1000),
      advertisementsAccepted: this.accepted,
      rejected: this.rejected,
      sessionUniqueAliases: this.sessionAliases.size,
      openWindows: this.aggregator.windows.size,
      retiredWindows: this.aggregator.closed.length,
      droppedClosedWindows: this.aggregator.droppedClosedWindows
    };
  }
  summary() {
    this.tick();
    return {
      simulation: false,
      hardware: 'palantiny-macos-corebluetooth',
      network: false,
      radio: this.radio,
      scanSeconds: this.startTime === null ? 0 : Math.floor((this.clock() - this.startTime) / 1000),
      windowSeconds: this.windowMs / 1000,
      advertisementsAccepted: this.accepted,
      rejected: this.rejected,
      sessionUniqueAliases: this.sessionAliases.size,
      aliasCountCapped: this.aliasCountCapped,
      droppedLines: this.droppedLines,
      droppedClosedWindows: this.aggregator.droppedClosedWindows,
      rssi: { min: this.rssiMin, max: this.rssiMax },
      complete: !this.aborted,
      closedWindows: [...this.closedWindows],
      note: 'BLE alias activity, not people. Identifiers and payloads are not logged or published.'
    };
  }
  clearSensitiveState() { this.sessionAliases.clear(); this.aggregator.windows.clear(); }
}
