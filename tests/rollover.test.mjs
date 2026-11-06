import test from 'node:test';
import assert from 'node:assert/strict';
import { ActivityAggregator } from '../src/aggregator.mjs';
import { buildPublishableObservation } from '../src/privacy.mjs';

const base = Date.UTC(2026, 10, 6, 12, 0, 0);
const event = (ts, id) => ({ t: 'ble', ts, id, rssi: -85 });

test('one-shot 73-second scan preserves completed windows beyond three-window cap', () => {
  const a = new ActivityAggregator({ windowMs: 20_000, maxOpenWindows: 3 });
  const counts = [20, 24, 24, 25];
  for (const [bucket, count] of counts.entries()) {
    for (let i = 0; i < count; i++)
      assert.equal(a.ingest(event(base + bucket * 20_000 + i * 300, `private-${bucket}-${i}`)), true);
  }
  const windows = a.flush(base + 80_000);
  assert.deepEqual(windows.map(w => w.observedAliases), counts);
  assert.deepEqual(windows.map(w => w.bucketStart), counts.map((_, i) => base + i * 20_000));
  assert.ok(windows.every(w => w.complete));
  assert.equal(JSON.stringify(windows).includes('private-'), false);
});

test('closed numeric summaries have bounded retention and observable loss', () => {
  const a = new ActivityAggregator({ windowMs: 20_000, maxOpenWindows: 1, maxClosedWindows: 2 });
  for (let i = 0; i < 5; i++) assert.equal(a.ingest(event(base + i * 20_000, `private-${i}`)), true);
  assert.equal(a.droppedClosedWindows, 2);
  assert.deepEqual(a.flush(base + 100_000).map(w => w.bucketStart),
    [base + 40_000, base + 60_000, base + 80_000]);
});

test('retired windows reject late events without corrupting later buckets', () => {
  const a = new ActivityAggregator({ windowMs: 20_000, maxOpenWindows: 1 });
  assert.equal(a.ingest(event(base, 'private-a')), true);
  assert.equal(a.ingest(event(base + 20_000, 'private-b')), true);
  assert.equal(a.ingest(event(base + 10_000, 'private-late')), false);
  assert.deepEqual(a.flush(base + 40_000).map(w => w.observedAliases), [1, 1]);
});

test('default gate delays 15 minutes while explicit zero-delay diagnostic is local only', () => {
  const a = new ActivityAggregator({ windowMs: 20_000 });
  for (let i = 0; i < 24; i++) a.ingest(event(base + 1000, `private-${i}`));
  const [window] = a.flush(base + 20_000);
  const policy = { consent: true, area: 'local-mac-scan' };
  assert.equal(buildPublishableObservation(window, policy, base + 20_000).reason, 'not_ready');
  const local = buildPublishableObservation(window, { ...policy, delayMs: 0 }, base + 20_000);
  assert.equal(local.ok, true);
  assert.equal(local.report.activityIndex, 20);
  assert.equal(buildPublishableObservation(window, policy, base + 15 * 60_000 + 20_000).ok, true);
  assert.equal(JSON.stringify(local).includes('private-'), false);
});
