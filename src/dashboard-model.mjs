import {REGIONS} from './dashboard-regions.mjs';
const HOUR=3600000;
/** Read-only dashboard projection over a regional aggregate query interface. */
export function createDashboardModel({query,now=Date.now(),regions=REGIONS}) {
 if(typeof query!=='function')throw new TypeError('aggregate query required');
 const current=Math.floor((now-15*60000)/HOUR)*HOUR;
  function rows(id,start,end){return query({area:id,start,end,limit:500})
    .map(r=>({timestamp:r.bucketStart,index:r.relativeBleActivity,sources:r.sources}));}
  const start=current-48*HOUR;
  const projectedRegions=regions.map(r=>{
   const points=rows(r.id,start,current),latest=points.at(-1);
   const fresh=latest&&latest.timestamp>=current-HOUR;
   const previous=latest&&points.find(p=>p.timestamp===latest.timestamp-24*HOUR);
   return {...r,index:fresh?latest.index:null,latestAt:latest?.timestamp??null,
    sources:latest?.sources??0,quality:!fresh?'insufficient_coverage':
    latest.sources<3?'limited_coverage':'experimental',
    changePct:fresh&&previous&&previous.index?Math.round((latest.index-previous.index)/previous.index*100):null};
  });
  return {overview(){
   const active=projectedRegions.filter(r=>r.index!==null);
   return {schema:'pulsemesh.dashboard.v1',simulation:true,geography:'schematic_not_georeferenced',
    metric:'relative_ble_alias_activity',generatedAt:new Date(now).toISOString(),
    summary:{regions:projectedRegions.length,reporting:active.length,averageIndex:active.length?
     Math.round(active.reduce((n,r)=>n+r.index,0)/active.length):null},regions:projectedRegions};
  },history(id,hours=24){
   if(!regions.some(r=>r.id===id))throw Error('unknown_region');
   if(![24,48].includes(hours))throw Error('unsupported_range');
   const points=rows(id,current-hours*HOUR,current);
   const baseline=hours===24?rows(id,current-48*HOUR,current-24*HOUR)
    .map(p=>({...p,timestamp:p.timestamp+24*HOUR})):[];
   return {schema:'pulsemesh.history.v1',simulation:true,regionId:id,hours,points,baseline};
  }
 };
}
