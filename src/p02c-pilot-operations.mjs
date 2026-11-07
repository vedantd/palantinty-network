import path from 'node:path';
import {lstatSync,existsSync,openSync,writeFileSync,closeSync,
 readFileSync,unlinkSync} from 'node:fs';

const FILE='PILOT_DISABLED.json';
const PEER=/^[1-9A-HJ-NP-Za-km-z]{40,128}$/;

/**
 * Operator-local, persistent emergency stop. This is not a remote admin API.
 * Mere presence of the marker disables the node, even if corrupt/symlinked.
 */
export function pilotStopPath(stateDir){
 if(typeof stateDir!=='string'||!path.isAbsolute(stateDir))
  throw new TypeError('Absolute operator state directory required');
 return path.join(stateDir,FILE);
}
export function assertPrivatePilotDir(stateDir){
 const st=lstatSync(stateDir);
 if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0)
  throw Error('Operator state directory must be private 0700');
}
export function isPilotDisabled(stateDir){
 assertPrivatePilotDir(stateDir);
 return existsSync(pilotStopPath(stateDir));
}
export function assertPilotEnabled(stateDir){
 if(isPilotDisabled(stateDir))
  throw Error('Pilot locally disabled: operator review required before restart');
}
function readMarker(stateDir){
 const p=pilotStopPath(stateDir);
 const st=lstatSync(p);
 if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o177)!==0||
    st.size<2||st.size>1024)
  throw Error('Unsafe pilot disable marker: do not resume');
 const item=JSON.parse(readFileSync(p,'utf8'));
 if(!item||item.schema!=='palantiny.p02c-local-stop.v1'||
    !['emergency-stop','peer-revoked'].includes(item.reason)||
    (item.reason==='peer-revoked'&&!PEER.test(item.revokedPeerId))||
    (item.reason==='emergency-stop'&&item.revokedPeerId!==null))
  throw Error('Malformed pilot disable marker: do not resume');
 return item;
}
export function disablePilot(stateDir,{reason='emergency-stop',revokedPeerId=null}={}){
 assertPrivatePilotDir(stateDir);
 if(!['emergency-stop','peer-revoked'].includes(reason)||
    (reason==='peer-revoked'&&!PEER.test(revokedPeerId))||
    (reason==='emergency-stop'&&revokedPeerId!==null))
  throw Error('Invalid local pilot disable reason');
 const p=pilotStopPath(stateDir);
 if(existsSync(p))return Object.freeze({disabled:true,newlyDisabled:false});
 const entry={schema:'palantiny.p02c-local-stop.v1',reason,revokedPeerId,
  createdAt:new Date().toISOString()};
 const fd=openSync(p,'wx',0o600);
 try{writeFileSync(fd,JSON.stringify(entry)+'\n');}
 finally{closeSync(fd);}
 return Object.freeze({disabled:true,newlyDisabled:true});
}
export function resumePilot(stateDir,{configuredPeerId,manualReview=false}={}){
 assertPrivatePilotDir(stateDir);
 if(manualReview!==true||typeof configuredPeerId!=='string'||!PEER.test(configuredPeerId))
  throw Error('Explicit manual peer/firewall verification is required');
 const marker=readMarker(stateDir);
 if(marker.reason==='peer-revoked'&&marker.revokedPeerId===configuredPeerId)
  throw Error('Revoked remote peer is still configured: fail closed');
 unlinkSync(pilotStopPath(stateDir));
 return Object.freeze({disabled:false,manualReviewRequiredForFutureStops:true});
}

/** Poll until interrupted; stop can be initiated from another process.
 * A slow/blocking event loop may delay detection: use host firewall too.
 */
export function watchPilotStop(stateDir,{onTrip,intervalMs=100}={}){
 if(typeof onTrip!=='function'||!Number.isSafeInteger(intervalMs)||
    intervalMs<25||intervalMs>5000)
  throw Error('Valid pilot stop callback and interval required');
 assertPilotEnabled(stateDir);
 let closed=false,tripped=false;
 const tick=()=>{
  if(closed||tripped)return;
  try{assertPilotEnabled(stateDir);}
  catch(error){
   tripped=true;
   try{onTrip(error);}catch{}
  }
 };
 const timer=setInterval(tick,intervalMs);
 timer.unref();
 return Object.freeze({
  check:()=>{
   tick();
   if(tripped)throw Error('Pilot shutdown requested');
  },
  close:()=>{closed=true;clearInterval(timer);},
  tripped:()=>tripped
 });
}
