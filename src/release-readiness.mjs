/**
 * Release-readiness reporting, not a deployment authorization mechanism.
 * Presence of links does not attest their correctness. Human verification
 * and independently reviewed evidence are required before release.
 */
const PROFILES=['open-synthetic-testnet','public-real-sensing'];
const STATUS=new Set(['blocked','in-progress','verified']);
const ALLOWED_KEYS=['schema','updatedOn','disclaimer','profiles'];
const allowed=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&
  Object.keys(v).every(x=>keys.includes(x))&&keys.every(x=>Object.hasOwn(v,x));
export function evaluatePublicReleaseGates(ledger,profile) {
 if(!PROFILES.includes(profile))throw new Error('Unknown release profile');
 if(!allowed(ledger,ALLOWED_KEYS)||
    ledger.schema!=='palantiny.public-release-gates.v1'||
    !/^\d{4}-\d{2}-\d{2}$/.test(ledger.updatedOn)||
    typeof ledger.disclaimer!=='string'||
    !allowed(ledger.profiles,PROFILES))
    throw new Error('Invalid release evidence ledger');
 const reports={};
 for(const name of PROFILES){
  const entry=ledger.profiles[name];
  if(!entry||typeof entry.description!=='string'||
    !Array.isArray(entry.gates)||entry.gates.length===0 ||
    Object.keys(entry).some(k=>!['description','prerequisite','gates'].includes(k)))
    throw new Error('Invalid profile: '+name);
  if(name==='public-real-sensing' &&
    entry.prerequisite!=='open-synthetic-testnet')
    throw new Error('Real sensing must require synthetic-testnet gate');
  const found=new Set();
  for(const gate of entry.gates){
   if(!allowed(gate,['id','status','evidence','reason']) ||
      typeof gate.id!=='string'||!/^[a-z][a-z0-9-]{2,63}$/.test(gate.id)||
      found.has(gate.id)||!STATUS.has(gate.status)||
      typeof gate.reason!=='string'||!gate.reason.trim()||
      !Array.isArray(gate.evidence)||
      gate.evidence.some(x=>typeof x!=='string'||!/^https:\/\/[^\s]+$/.test(x)))
     throw new Error('Invalid release gate in '+name);
   found.add(gate.id);
   if(gate.status==='verified'&&gate.evidence.length===0)
    throw new Error('Verified gate requires evidence: '+gate.id);
  }
  const blocked=entry.gates.filter(x=>x.status!=='verified');
  reports[name]={ready:blocked.length===0,
    verified:entry.gates.length-blocked.length,total:entry.gates.length,
    outstanding:blocked.map(x=>({id:x.id,status:x.status,reason:x.reason}))};
 }
 const current=reports[profile],dependency=
  profile==='public-real-sensing'&&reports['open-synthetic-testnet'].ready===false;
 return Object.freeze({profile,ready:current.ready&&!dependency,
   dependencyBlocked:dependency,verified:current.verified,total:current.total,
   outstanding:current.outstanding});
}
