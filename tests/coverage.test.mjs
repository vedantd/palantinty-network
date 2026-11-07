import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeHourlyCoverage,hourlyCoverageSeries} from '../src/coverage.mjs';
import {createDashboardModel} from '../src/dashboard-model.mjs';
const HOUR=3600000;
const END=Date.UTC(2026,10,6,18);
test('missing buckets are explicit nulls, not zero activity',()=>{
 const points=[{timestamp:END-3*HOUR,index:0,sources:2},
  {timestamp:END-HOUR,index:35,sources:3}];
 const result=hourlyCoverageSeries(points,{start:END-4*HOUR,end:END});
 assert.deepEqual(result.coverage,{
  expectedBuckets:4,observedBuckets:2,missingBuckets:2,coveragePct:50,
  status:'incomplete',semantics:'released_aggregate_presence_not_sensor_uptime'});
 assert.deepEqual(result.buckets.map(b=>b.index),[null,0,null,35]);
 assert.deepEqual(result.buckets.map(b=>b.status),['missing','observed','missing','observed']);
});
test('invalid or duplicate aggregate rows cannot inflate coverage',()=>{
 const rows=[{timestamp:END-HOUR,index:20,sources:2},
  {timestamp:END-HOUR,index:25,sources:2},
  {timestamp:END-2*HOUR,index:20,sources:1},
  {timestamp:END-3*HOUR,index:-5,sources:3},
  {timestamp:END,index:40,sources:2}];
 const coverage=summarizeHourlyCoverage(rows,{start:END-4*HOUR,end:END});
 assert.equal(coverage.observedBuckets,1);
 assert.equal(coverage.missingBuckets,3);
 assert.throws(()=>summarizeHourlyCoverage([], {start:END-1,end:END}),RangeError);
 assert.throws(()=>summarizeHourlyCoverage([], {start:END,end:END}),RangeError);
});
test('full hourly aggregate coverage permits comparisons; missing hour suppresses them',()=>{
 const now=END+37*60_000;
 const current=Math.floor((now-15*60000)/HOUR)*HOUR;
 const points=Array.from({length:48},(_,i)=>({
  bucketStart:current-(48-i)*HOUR,relativeBleActivity:i<24?20:30,sources:3
 }));
 const query=({start,end})=>points.filter(p=>p.bucketStart>=start&&p.bucketStart<end);
 const regions=[{id:'test-region',name:'Test Region'}];
 const full=createDashboardModel({query,now,regions});
 assert.equal(full.overview().regions[0].coverage.coveragePct,100);
 assert.equal(full.overview().regions[0].changePct,50);
 const missing=createDashboardModel({query:({start,end})=>query({start,end})
  .filter(p=>p.bucketStart!==current-2*HOUR),now,regions});
 assert.equal(missing.overview().regions[0].coverage.missingBuckets,1);
 assert.equal(missing.overview().regions[0].changePct,null);
});
