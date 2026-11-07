import path from 'node:path';
import {readP02cHostConfig} from './p02c-host-config.mjs';
import {readPrivatePeerLedger} from './p03-private-peer-ledger.mjs';
import {assertPrivatePilotDir} from './p02c-pilot-operations.mjs';

/**
 * Offline-only P03c trust drift audit. Never modifies config, revocation,
 * stop markers, or a running node. A clean audit is NOT authorization to run.
 */
export function auditPrivatePilotPeer(configPath) {
 const config=readP02cHostConfig(configPath);
 assertPrivatePilotDir(config.stateDir);
 const ledger=readPrivatePeerLedger(config.stateDir,config.pilotId);
 const matching=ledger.entries.filter(e=>e.peerId===config.remotePeerId);
 const record=matching[0];
 const reasons=[];
 if(!record)reasons.push('remote-peer-not-enrolled');
 else {
  if(record.state!=='approved')reasons.push('remote-peer-not-approved');
  if(record.remoteIp!==config.remoteIp)reasons.push('remote-ip-drift');
  if(record.seedAddress!==config.remoteSeed)reasons.push('remote-seed-drift');
 }
 return Object.freeze({
  schema:'palantiny.private-peer-audit.v1',
  syntheticOnly:true,publicTestnetReady:false,
  pilotId:config.pilotId,ledgerRevision:ledger.revision,
  remotePeerId:config.remotePeerId,
  consistent:reasons.length===0,
  reasons:Object.freeze(reasons),
  activated:false,
  note:'Offline snapshot only. Operator must stop/review/restart manually; emergency stop and live trust are unchanged.'
 });
}
