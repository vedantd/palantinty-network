import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCalibration, parseManualCountsCsv, spearmanCorrelation,
  pearsonCorrelation } from '../src/calibration.mjs';
import { makeLocalScanArtifact } from '../src/local-scan-artifact.mjs';

const t=Date.UTC(2026,10,6,16);
const sec=60;
const source = Array.from({length:12},(_,i)=>({
  bucketStart:t+i*60_000,bucketSeconds:60,
  observedAliases:[25,40,20,55,30,45,15,65,50,35,60,70][i],
  activityIndex:Math.floor([25,40,20,55,30,45,15,65,50,35,60,70][i]/5)*5,
  defaultGate:'not_ready'
}));
const fixture={
  simulation:false,network:false,complete:true,radio:'on',
  scanSeconds:780,windowSeconds:sec,advertisementsAccepted:1000,rejected:0,
  sessionUniqueAliases:80,aliasCountCapped:false,
  droppedLines:0,droppedClosedWindows:0,closedWindows:source
};
const manual=source.map((w,i)=>({bucketStart:w.bucketStart,
  manualCount:[12,25,7,42,14,30,4,55,39,20,47,65][i]}));

test('only explicitly allowlisted aggregate fields may be saved',()=>{
  const raw={...fixture,uuid:'private-uuid',mac:'aa:bb',name:'private-device',
    payload:'manufacturer-secrets',
    closedWindows:source.map(w=>({...w,id:'private-ID',rssiHistory:[-40,-80]}))};
  const artifact=makeLocalScanArtifact(raw);
  const saved=JSON.stringify(artifact);
  for(const secret of ['private-uuid','aa:bb','private-device',
    'manufacturer-secrets','private-ID','rssiHistory']) assert.ok(!saved.includes(secret));
  assert.equal(artifact.schema,'pulsemesh.scan.local.v1');
  assert.equal(artifact.closedWindows.length,12);
});

test('same minute timestamp joins are exact and correlations compute',()=>{
  const scan=makeLocalScanArtifact(fixture);
  const result=evaluateCalibration(scan,manual);
  assert.equal(result.status,'exploratory_statistics_available');
  assert.equal(result.matchedWindows,12);
  assert.equal(result.matchedFraction,1);
  assert.ok(result.correlation.spearman>0.95);
  assert.ok(result.correlation.pearson>0.95);
  assert.deepEqual(result.qualityFlags,[]);
  assert.ok(!JSON.stringify(result).includes('private-ID'));
});

test('reordered manual rows match by timestamp, not array position',()=>{
  const scan=makeLocalScanArtifact(fixture);
  const a=evaluateCalibration(scan,manual);
  const b=evaluateCalibration(scan,[...manual].reverse());
  assert.deepEqual(a,b);
});
test('insufficient pilot data never claims validated correlation',()=>{
  const result=evaluateCalibration(makeLocalScanArtifact(fixture),
    manual.slice(0,4));
  assert.equal(result.status,'insufficient_evidence');
  assert.ok(result.qualityFlags.includes('insufficient_matched_windows'));
  assert.equal(result.matchedWindows,4);
  assert.ok(result.qualityFlags.includes('unmatched_scan_windows'));
});
test('constant measurements must not produce misleading correlation',()=>{
  assert.equal(spearmanCorrelation([10,10,10],[1,2,3]),null);
  assert.equal(pearsonCorrelation([1,2,3],[5,5,5]),null);
  const scan=makeLocalScanArtifact({...fixture,closedWindows:source.map(w=>({...w,observedAliases:20}))});
  const result=evaluateCalibration(scan,manual);
  assert.equal(result.status,'insufficient_evidence');
  assert.ok(result.qualityFlags.includes('constant_or_insufficient_variation'));
});
test('mean-rank Spearman handles ties and reverse order',()=>{
  assert.equal(spearmanCorrelation([1,2,3,4],[4,3,2,1]),-1);
  assert.equal(spearmanCorrelation([1,2,2,4],[2,4,4,8]),1);
});
test('manual CSV is strict UTC, rejects identifiers and duplicate buckets',()=>{
  const csv='bucketStart,manualCount\n'+manual.map(
    w=>`${new Date(w.bucketStart).toISOString()},${w.manualCount}`).join('\n')+'\n';
  assert.deepEqual(parseManualCountsCsv(csv),manual);
  assert.throws(()=>parseManualCountsCsv('bucketStart,manualCount\n2026-11-06,10'));
  assert.throws(()=>parseManualCountsCsv('bucketStart,manualCount\n'+
    `${new Date(t).toISOString()},5\n${new Date(t).toISOString()},6\n`),/Duplicate/);
  assert.throws(()=>parseManualCountsCsv('bucketStart,manualCount\n'+
    `${new Date(t).toISOString()},John\n`));
});
test('reject non-local, incomplete and non-aligned scan summaries',()=>{
  const scan=makeLocalScanArtifact(fixture);
  assert.throws(()=>evaluateCalibration({...scan,network:true},manual));
  assert.throws(()=>evaluateCalibration({...scan,complete:false},manual));
  assert.throws(()=>evaluateCalibration({...scan,closedWindows:[
    {...scan.closedWindows[0],bucketStart:t+1000}]},manual),/scan bucket/);
  assert.throws(()=>evaluateCalibration({...scan,closedWindows:[
    scan.closedWindows[0],scan.closedWindows[0]]},manual),/duplicate/);
});
test('quality flags expose radio and sensor reliability caveats',()=>{
  const scan=makeLocalScanArtifact({...fixture,radio:'unknown',rejected:5,
    droppedLines:2,droppedClosedWindows:1,aliasCountCapped:true});
  const result=evaluateCalibration(scan,manual);
  for(const flag of ['bluetooth_status_unconfirmed','rejected_sensor_observations',
    'dropped_sensor_lines','dropped_scan_windows','alias_count_capped'])
    assert.ok(result.qualityFlags.includes(flag));
});
