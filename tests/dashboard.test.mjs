import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createSyntheticDashboard} from '../src/dashboard.mjs';
import {createDashboardServer} from '../src/dashboard-server.mjs';
test('real durable indexer serves signed synthetic regional aggregates only',()=>{
 const demo=createSyntheticDashboard({now:Date.UTC(2026,10,6,18,37)});
 try{
  const o=demo.overview();
  assert.equal(o.simulation,true);
  assert.equal(o.geography,'schematic_not_georeferenced');
  assert.equal(o.summary.regions,5);
  assert.equal(o.summary.reporting,4);
  assert.equal(o.regions.find(r=>r.id==='station-approach').index,null);
  assert.equal(o.regions.find(r=>r.id==='west-gardens').quality,'limited_coverage');
  const h=demo.history('market-lane',24);
  assert.equal(h.points.length,24);
  assert.equal(h.baseline.length,24);
  assert.equal(demo.history('market-lane',48).points.length,48);
  assert.ok(h.points.every(p=>p.sources>=2));
  assert.throws(()=>demo.history('../secrets'),/unknown_region/);
  assert.throws(()=>demo.history('market-lane',1000),/unsupported_range/);
  const output=JSON.stringify(o)+JSON.stringify(h);
  for(const forbidden of ['keyId','reportId','publicKey','signature','observedAliases','macAddress'])
   assert.ok(!output.includes(forbidden),forbidden);
 }finally{demo.close();}
});
test('read-only dashboard HTTP server protects static assets and API',async()=>{
 const demo=createSyntheticDashboard({now:Date.UTC(2026,10,6,18,37)});
 const server=createDashboardServer(demo);
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const origin='http://127.0.0.1:'+server.address().port;
 try{
  const page=await fetch(origin+'/');
  assert.equal(page.status,200);
  assert.match(await page.text(),/SYNTHETIC DATA/);
  assert.match(page.headers.get('content-security-policy'),/default-src 'none'/);
  assert.equal((await fetch(origin+'/styles.css')).status,200);
  assert.equal((await fetch(origin+'/app.js')).status,200);
  const overview=await (await fetch(origin+'/api/overview')).json();
  assert.equal(overview.summary.reporting,4);
  const history=await (await fetch(origin+'/api/history?region=market-lane&hours=24')).json();
  assert.equal(history.points.length,24);
  assert.equal((await fetch(origin+'/api/history?region=unknown')).status,404);
  assert.equal((await fetch(origin+'/api/history?region=market-lane&hours=2000')).status,400);
  assert.equal((await fetch(origin+'/api/history?region=market-lane&region=north-quay')).status,400);
  assert.equal((await fetch(origin+'/api/overview?debug=1')).status,400);
  assert.equal((await fetch(origin+'/api/history',{method:'POST'})).status,405);
 }finally{await new Promise(resolve=>server.close(resolve));demo.close();}
});
