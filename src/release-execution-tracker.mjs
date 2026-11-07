import {readFileSync} from 'node:fs';

const statuses=new Set(['planned','partial','done','blocked-external']);
const exact=(x,keys)=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const requiredReleaseIds=['R-SYN','R-REAL'];
const permittedKey=/^[A-Za-z0-9][A-Za-z0-9-]{1,20}$/;
export function validateReleaseExecutionTracker(tracker,gates){
 if(!exact(tracker,['schema','updatedOn','policy','sliceStatuses','slices'])||
   tracker.schema!=='palantiny.release-execution-tracker.v1'||
   typeof tracker.policy!=='string'||tracker.policy.length<20||
   !/^20\d{2}-\d{2}-\d{2}$/.test(tracker.updatedOn)||
   !Array.isArray(tracker.sliceStatuses)||
   tracker.sliceStatuses.length!==statuses.size||
   new Set(tracker.sliceStatuses).size!==statuses.size||
   tracker.sliceStatuses.some(s=>!statuses.has(s))||
   !Array.isArray(tracker.slices)||tracker.slices.length<20||
   tracker.slices.length>100)
  throw Error('Malformed or incomplete release execution tracker');
 if(gates?.schema!=='palantiny.public-release-gates.v1')
  throw Error('Invalid independent public-release evidence ledger');
 const allowedGates=new Set();
 for(const profile of Object.values(gates.profiles||{})){
  if(!Array.isArray(profile.gates))throw Error('Invalid release gate profile');
  for(const gate of profile.gates){
   if(allowedGates.has(gate.id))throw Error('Duplicate release gate ID');
   allowedGates.add(gate.id);
  }
 }
 const ids=new Set();
 for(const s of tracker.slices){
  if(!exact(s,['id','title','status','dependsOn','gateIds','evidence'])||
     typeof s.id!=='string'||!permittedKey.test(s.id)||
     ids.has(s.id)||typeof s.title!=='string'||s.title.trim().length<6||
     !statuses.has(s.status)||
     !Array.isArray(s.dependsOn)||s.dependsOn.length>10||
     !Array.isArray(s.gateIds)||s.gateIds.length>15||
     !Array.isArray(s.evidence)||s.evidence.length>20||
     (s.status==='done'&&s.evidence.length===0)||
     s.evidence.some(url=>typeof url!=='string'||
       !/^https:\/\/github\.com\/vedantd\/palantinty-network\/pull\/[0-9]+$/.test(url))||
     new Set(s.dependsOn).size!==s.dependsOn.length||
     new Set(s.gateIds).size!==s.gateIds.length||
     s.gateIds.some(id=>!allowedGates.has(id)))
    throw Error('Invalid execution slice '+s?.id);
  ids.add(s.id);
 }
 const nodes=new Map(tracker.slices.map(s=>[s.id,s]));
 const seen=new Set(),active=new Set();
 function visit(id){
  if(active.has(id))throw Error('Execution plan has a dependency cycle at '+id);
  if(seen.has(id))return;
  const item=nodes.get(id);
  if(!item)throw Error('Unknown execution dependency '+id);
  active.add(id);
  for(const dep of item.dependsOn){
   if(dep===id)throw Error('Self-dependent execution slice');
   visit(dep);
  }
  active.delete(id);seen.add(id);
 }
 for(const id of ids)visit(id);
 for(const [releaseId,profileId] of [
  ['R-SYN','open-synthetic-testnet'],['R-REAL','public-real-sensing']
 ]){
  const release=nodes.get(releaseId),profile=gates.profiles?.[profileId];
  if(!release||!profile)throw Error('Required release milestone missing');
  const expected=profile.gates.map(g=>g.id).sort().join(',');
  const actual=[...release.gateIds].sort().join(',');
  if(expected!==actual)throw Error('Release milestone missing evidence gate coverage: '+releaseId);
  if(profile.gates.some(g=>g.status!=='verified')&&release.status!=='blocked-external')
   throw Error('Cannot mark a release target ready when official evidence gates are blocked');
 }
 if(!nodes.get('R-REAL').dependsOn.includes('R-SYN'))
  throw Error('Real-sensor release must depend on synthetic testnet release');
 return Object.freeze({
  schema:'palantiny.release-execution-check.v1',
  slices:tracker.slices.length,
  done:tracker.slices.filter(s=>s.status==='done').length,
  partial:tracker.slices.filter(s=>s.status==='partial').length,
  blockedExternal:tracker.slices.filter(s=>s.status==='blocked-external').length,
  launchReady:false,
  notes:'Tracker passes structural dependency/gate checks. This does not verify evidence or authorize public launch.'
 });
}
export function checkReleaseExecutionFiles({trackerPath='config/release-execution-tracker.json',
 gatePath='config/public-release-gates.json'}={}){
 return validateReleaseExecutionTracker(
  JSON.parse(readFileSync(trackerPath,'utf8')),
  JSON.parse(readFileSync(gatePath,'utf8')));
}
