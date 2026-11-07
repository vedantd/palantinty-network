import {readP02cHostConfig} from './p02c-host-config.mjs';
import {auditPrivatePilotPeer} from './p03-peer-audit.mjs';
import {assertPilotEnabled} from './p02c-pilot-operations.mjs';

/**
 * Operator-approved local trust is now mandatory for the standalone
 * synthetic pilot. This does not provide independent operator attestation
 * or a public network admission protocol.
 */
export function assertApprovedPrivatePilot(configPath) {
 const config=readP02cHostConfig(configPath);
 assertPilotEnabled(config.stateDir);
 const audit=auditPrivatePilotPeer(configPath);
 if(!audit.consistent)
  throw Error('Private pilot peer not approved: '+audit.reasons.join(','));
 // Recheck after the independent config/ledger read to detect a subset of
 // concurrent mutations. The live watcher also refuses revision changes.
 const reread=readP02cHostConfig(configPath);
 const again=auditPrivatePilotPeer(configPath);
 assertPilotEnabled(config.stateDir);
 if(JSON.stringify(config)!==JSON.stringify(reread)||
    audit.ledgerRevision!==again.ledgerRevision||
    !again.consistent)
  throw Error('Private pilot approval changed during validation');
 return Object.freeze({
  schema:'palantiny.p03-runtime-trust.v1',
  pilotId:config.pilotId,peerId:config.remotePeerId,
  remoteIp:config.remoteIp,remoteSeed:config.remoteSeed,
  ledgerRevision:audit.ledgerRevision,approved:true,
  syntheticOnly:true,publicTestnetReady:false
 });
}

/**
 * Stop a running, explicitly pinned synthetic pilot if the approval ledger,
 * configuration, emergency marker, or ledger revision changes.
 *
 * This is best-effort process-local polling. It is not an atomic cross-
 * process capability nor a distributed revocation guarantee. An operator
 * should firewall/shut down the port during a real incident.
 */
export function watchApprovedPrivatePilot(configPath,{onTrip,intervalMs=100}={}){
 if(typeof onTrip!=='function'||!Number.isSafeInteger(intervalMs)||
    intervalMs<25||intervalMs>5000)
  throw Error('Valid trust-trip callback and check interval required');
 const baseline=assertApprovedPrivatePilot(configPath);
 let tripped=false,closed=false;
 const check=()=>{
  if(closed)return;
  if(tripped)throw Error('Private pilot trust revoked');
  try{
   const now=assertApprovedPrivatePilot(configPath);
   if(now.ledgerRevision!==baseline.ledgerRevision||
      now.peerId!==baseline.peerId||
      now.remoteIp!==baseline.remoteIp||
      now.remoteSeed!==baseline.remoteSeed)
    throw Error('Private pilot approval or pinned remote changed');
  }catch(error){
   tripped=true;
   try{onTrip(error);}catch{}
   throw error;
  }
 };
 const timer=setInterval(()=>{try{check();}catch{}},intervalMs);
 timer.unref();
 return Object.freeze({
  baseline,check,close:()=>{closed=true;clearInterval(timer);},
  tripped:()=>tripped
 });
}
