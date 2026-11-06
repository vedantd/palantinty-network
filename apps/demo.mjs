import { ActivityAggregator } from '../src/aggregator.mjs';
import { buildPublishableObservation } from '../src/privacy.mjs';
const now = Date.UTC(2026,10,6,12);
const start = now - 30 * 60_000;
const aggregator = new ActivityAggregator();
for(let i=0;i<35;i++) aggregator.ingest({t:'ble',ts:start+10_000,id:'synthetic-'+i,rssi:-60});
const [window] = aggregator.flush(start+60_000);
console.log(JSON.stringify({simulation:true,network:false,
  output:buildPublishableObservation(window,{consent:true,area:'demo-coarse-cell'},now)},null,2));
