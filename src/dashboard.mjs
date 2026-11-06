import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DurableRegionalIngest} from './durable-ingest.mjs';
import {openLocalIdentity} from './identity.mjs';
import {signReport} from './protocol.mjs';
export const REGIONS=[
{id:'north-quay',name:'North Quay',x:10,y:13,w:29,h:29},
{id:'market-lane',name:'Market Lane',x:43,y:10,w:31,h:31},
{id:'civic-square',name:'Civic Square',x:32,y:46,w:31,h:34},
{id:'west-gardens',name:'West Gardens',x:5,y:50,w:24,h:35},
{id:'station-approach',name:'Station Approach',x:68,y:46,w:27,h:34}
];
const HOUR=3600000;
export function createSyntheticDashboard({now=Date.now()}={}){
 const dir=mkdtempSync(path.join(tmpdir(),'pulsemesh-m06-'));
 try {
  const keys=[0,1,2].map(i=>openLocalIdentity(path.join(dir,'signer-'+i)));
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
  function rows(id,start,end){return ingest.query({area:id,start,end,limit:500})
    .map(r=>({timestamp:r.bucketStart,index:r.relativeBleActivity,sources:r.sources}));}
  const start=current-48*HOUR;
  const regions=REGIONS.map(r=>{
   const points=rows(r.id,start,current),latest=points.at(-1);
   const fresh=latest&&latest.timestamp>=current-HOUR;
   const previous=latest&&points.find(p=>p.timestamp===latest.timestamp-24*HOUR);
   return {...r,index:fresh?latest.index:null,latestAt:latest?.timestamp??null,
    sources:latest?.sources??0,quality:!fresh?'insufficient_coverage':
    latest.sources<3?'limited_coverage':'experimental',
    changePct:fresh&&previous&&previous.index?Math.round((latest.index-previous.index)/previous.index*100):null};
  });
  return {overview(){
   const active=regions.filter(r=>r.index!==null);
   return {schema:'pulsemesh.dashboard.v1',simulation:true,geography:'schematic_not_georeferenced',
    metric:'relative_ble_alias_activity',generatedAt:new Date(now).toISOString(),
    summary:{regions:5,reporting:active.length,averageIndex:active.length?
     Math.round(active.reduce((n,r)=>n+r.index,0)/active.length):null},regions};
  },history(id,hours=24){
   if(!REGIONS.some(r=>r.id===id))throw Error('unknown_region');
   if(![24,48].includes(hours))throw Error('unsupported_range');
   const points=rows(id,current-hours*HOUR,current);
   const baseline=hours===24?rows(id,current-48*HOUR,current-24*HOUR)
    .map(p=>({...p,timestamp:p.timestamp+24*HOUR})):[];
   return {schema:'pulsemesh.history.v1',simulation:true,regionId:id,hours,points,baseline};
  },close(){ingest.close();rmSync(dir,{recursive:true,force:true});}};
 }catch(e){rmSync(dir,{recursive:true,force:true});throw e;}
}
