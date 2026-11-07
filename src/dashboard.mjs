import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DurableRegionalIngest} from './durable-ingest.mjs';
import {openLocalIdentity} from './identity.mjs';
import {REGIONS} from './dashboard-regions.mjs';
import {seedSyntheticReports} from './dashboard-fixture.mjs';
import {createDashboardModel} from './dashboard-model.mjs';
export {REGIONS};
const HOUR=3600000;
/** Demo composition root: only this function creates synthetic reports. */
export function createSyntheticDashboard({now=Date.now()}={}){
 const dir=mkdtempSync(path.join(tmpdir(),'pulsemesh-m06-'));
 let ingest;
 try {
  const keys=[0,1,2].map(i=>openLocalIdentity(path.join(dir,'signer-'+i)));
  ingest=new DurableRegionalIngest({dbPath:path.join(dir,'index','regional.sqlite'),
   authorizedKeys:new Set(keys.map(k=>k.keyId)),now:()=>now,maxAgeMs:72*HOUR,minOperators:2});
  seedSyntheticReports({dir,ingest,now,keys});
  const model=createDashboardModel({query:args=>ingest.query(args),now});
  let closed=false;
  return {...model,close(){if(closed)return;closed=true;try{ingest.close();}finally{rmSync(dir,{recursive:true,force:true});}}};
 }catch(e){try{ingest?.close();}finally{rmSync(dir,{recursive:true,force:true});}throw e;}
}
