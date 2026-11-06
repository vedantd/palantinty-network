import test from 'node:test';
import assert from 'node:assert/strict';
import { ActivityAggregator } from '../src/aggregator.mjs';
import { buildPublishableObservation } from '../src/privacy.mjs';

const now = Date.UTC(2026,10,6,12);
const start = now - 30 * 60_000;
const policy = { consent: true, area: 'test-coarse-cell' };
const window = { bucketStart:start, bucketSeconds:60, observedAliases:35, complete:true };

test('no network contribution without explicit opt-in', () => {
  assert.equal(buildPublishableObservation(window,{...policy,consent:false},now).reason,'opt_in_required');
});
test('never export identifiers or arbitrary fields', () => {
  const output=buildPublishableObservation({...window,id:'secret',name:'Person',bssid:'aa:bb'},policy,now);
  assert.equal(output.ok,true);
  const serialized=JSON.stringify(output.report);
  for(const forbidden of ['secret','Person','aa:bb']) assert.equal(serialized.includes(forbidden),false);
  assert.equal(output.report.activityIndex,35);
});
test('suppress low counts and insufficient delay', () => {
  assert.equal(buildPublishableObservation({...window,observedAliases:19},policy,now).reason,'below_threshold');
  assert.equal(buildPublishableObservation(window,policy,start+60_000).reason,'not_ready');
});
test('local aggregator deduplicates alias events', () => {
  const agg=new ActivityAggregator();
  agg.ingest({t:'ble',ts:start+100,id:'private-a',rssi:-60});
  agg.ingest({t:'ble',ts:start+200,id:'private-a',rssi:-60});
  agg.ingest({t:'ble',ts:start+300,id:'private-b',rssi:-60});
  assert.equal(agg.flush(start+60_000)[0].observedAliases,2);
});
