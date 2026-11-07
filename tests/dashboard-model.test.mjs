import test from 'node:test';
import assert from 'node:assert/strict';
import {createDashboardModel} from '../src/dashboard-model.mjs';

const now=Date.UTC(2026,10,6,18,37);
const hour=3600000;
const current=Math.floor((now-15*60000)/hour)*hour;
test('dashboard model queries injected aggregate source without keys, signing or SQLite',()=>{
 const calls=[];
 const query=({area,start,end,limit})=>{
  calls.push({area,start,end,limit});
  return [{bucketStart:current-hour,relativeBleActivity:30,sources:3},
   {bucketStart:current-25*hour,relativeBleActivity:20,sources:2}]
   .filter(p=>p.bucketStart>=start&&p.bucketStart<end)
   .sort((a,b)=>a.bucketStart-b.bucketStart);
 };
 const model=createDashboardModel({query,now,regions:[{id:'mock-zone',name:'Mock Zone'}]});
 const overview=model.overview();
 assert.equal(overview.summary.regions,1);
 assert.equal(overview.summary.reporting,1);
 assert.equal(overview.regions[0].index,30);
 assert.equal(overview.regions[0].changePct,null);
 assert.equal(overview.regions[0].coverage.missingBuckets,23);
 const history=model.history('mock-zone',24);
 assert.deepEqual(history.points,[{timestamp:current-hour,index:30,sources:3}]);
 assert.deepEqual(history.baseline,[{timestamp:current-hour,index:20,sources:2}]);
 assert.equal(history.coverage.expectedBuckets,24);
 assert.equal(history.coverage.observedBuckets,1);
 assert.equal(history.buckets.filter(b=>b.status==='missing').length,23);
 assert.equal(history.buckets[0].index,null);
 assert.ok(calls.every(c=>c.area==='mock-zone'&&c.limit===500));
 assert.throws(()=>model.history('missing'),/unknown_region/);
 assert.throws(()=>model.history('mock-zone',12),/unsupported_range/);
 const json=JSON.stringify(overview)+JSON.stringify(history);
 assert.ok(!json.includes('privateKey'));
 assert.ok(!json.includes('reportId'));
});
test('model rejects missing aggregate query implementation',()=>{
 assert.throws(()=>createDashboardModel({query:null}),/aggregate query required/);
});
