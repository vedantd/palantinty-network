import {signReport} from './protocol.mjs';
import {REGIONS} from './dashboard-regions.mjs';
const HOUR=3600000;
/** Synthetic fixture only: never used to manufacture production observations. */
export function seedSyntheticReports({ingest,now,keys}) {
  const ingest=new DurableRegionalIngest({dbPath:path.join(dir,'index','regional.sqlite'),
    authorizedKeys:new Set(keys.map(k=>k.keyId)),now:()=>now,maxAgeMs:72*HOUR,minOperators:2});
  // Never seed a bucket whose end violates the normal 15-minute delay.
  const sequences=[0,0,0],current=Math.floor((now-15*60000)/HOUR)*HOUR;
  for(let age=48;age>=1;age--){
   const ts=current-age*HOUR,hour=new Date(ts).getUTCHours();
   for(let j=0;j<REGIONS.length;j++){
    const region=REGIONS[j],cycle=Math.max(0,Math.sin((hour-5-j*1.2)/24*Math.PI*2));
    const base=Math.floor((18+j*6+48*cycle+((age*7+j*11)%6)*5)/5)*5;
    const count=region.id==='station-approach'&&age<=3?1:region.id==='west-gardens'&&age<=5?2:3;
    for(let i=0;i<count;i++){
     const envelope=signReport({schema:'pulsemesh.activity.v1',area:region.id,
      bucketStart:ts,bucketSeconds:3600,activityIndex:Math.max(5,base+(i-1)*5),
      metric:'ble_alias_activity'},keys[i],++sequences[i]);
     const outcome=ingest.ingest(envelope);
     if(!outcome.accepted)throw Error('Synthetic seed failed: '+outcome.code);
    }
   }
  }
  return current;
}
