import path from 'node:path';
import {readP02cHostConfig} from './p02c-host-config.mjs';
import {auditPrivatePilotPeer} from './p03-peer-audit.mjs';
import {assertPilotEnabled} from './p02c-pilot-operations.mjs';
import {openPersistentPeerIdentity} from './operator-identity.mjs';

/**
 * P03d offline startup-readiness diagnostic. This is NOT a capability token:
 * the running libp2p node does not consume this result. Any change after
 * inspection invalidates the snapshot. No file or live trust is modified.
 */
export async function inspectPrivatePilotStartup(configPath) {
 const config=readP02cHostConfig(configPath);
 assertPilotEnabled(config.stateDir);
 const identity=await openPersistentPeerIdentity(
  path.join(config.stateDir,'operator-identity'),{create:false});
 if(identity.peerId===config.remotePeerId)
  throw Error('Remote Peer ID must differ from operator identity');
 const audit=auditPrivatePilotPeer(configPath);
 // Refuse a concurrently changed config, ledger, or stop marker at the
 // second inspection. This narrows, but cannot eliminate, the TOCTOU window.
 const reread=readP02cHostConfig(configPath);
 const again=auditPrivatePilotPeer(configPath);
 assertPilotEnabled(config.stateDir);
 if(JSON.stringify(config)!==JSON.stringify(reread)||
    audit.ledgerRevision!==again.ledgerRevision||
    JSON.stringify(audit.reasons)!==JSON.stringify(again.reasons))
  throw Error('Private pilot inputs changed during offline inspection');
 return Object.freeze({
  schema:'palantiny.private-startup-inspection.v1',
  syntheticOnly:true,publicTestnetReady:false,activated:false,
  pilotId:config.pilotId,localPeerId:identity.peerId,
  remotePeerId:config.remotePeerId,ledgerRevision:audit.ledgerRevision,
  readyForManualReview:audit.consistent,
  reasons:audit.reasons,
  note:'Offline diagnostic only; not a runtime authorization. Stop, verify firewall and identities, and review manually before restart.'
 });
}
