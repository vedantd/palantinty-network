import path from 'node:path';
import {openSync,closeSync,writeFileSync,unlinkSync} from 'node:fs';
import {readP02cHostConfig,validateP02cHostConfig} from './p02c-host-config.mjs';
import {readPrivatePeerLedger} from './p03-private-peer-ledger.mjs';
import {assertPrivatePilotDir} from './p02c-pilot-operations.mjs';
import {openPersistentPeerIdentity} from './operator-identity.mjs';

/**
 * P03b: write a NEW private pilot configuration based on an independently
 * approved pinned peer. This never updates a live libp2p node or overrides
 * the local emergency disable marker.
 */
export async function stagePrivatePilotPeer({
 configPath,peerId,expectedRevision,outputPath
}={}){
 if(typeof configPath!=='string'||typeof outputPath!=='string'||
    typeof peerId!=='string'||!Number.isSafeInteger(expectedRevision)||
    expectedRevision<1)
  throw Error('Config, selected Peer ID, expected ledger revision and output path required');
 const config=readP02cHostConfig(configPath);
 assertPrivatePilotDir(config.stateDir);
 const ledger=readPrivatePeerLedger(config.stateDir,config.pilotId);
 if(ledger.revision!==expectedRevision)
  throw Error('Enrollment ledger revision changed: review pins again');
 const record=ledger.entries.find(entry=>entry.peerId===peerId);
 if(!record||record.state!=='approved')
  throw Error('Only explicitly approved, non-revoked peers may be staged');
 const identity=await openPersistentPeerIdentity(
  path.join(config.stateDir,'operator-identity'),{create:false});
 if(identity.peerId===peerId)
  throw Error('Cannot stage local self identity as a remote peer');
 const candidate=validateP02cHostConfig({
  schema:config.schema,syntheticOnly:true,pilotId:config.pilotId,
  role:config.role,area:config.area,stateDir:config.stateDir,
  listen:config.listen,allowPrivateLan:config.allowPrivateLan,
  remoteIp:record.remoteIp,remotePeerId:record.peerId,
  remoteSeed:record.seedAddress
 });
 // Require explicit operator review of any private overlay permissions.
 // Never expand a localhost-only runtime to RFC1918 just by staging.
 const target=path.resolve(outputPath);
 if(path.dirname(target)!==path.resolve(config.stateDir)||
    !/^[a-z0-9][a-z0-9._-]{2,100}\.json$/.test(path.basename(target)))
  throw Error('Stage only a new named JSON config inside the private operator directory');
 if(target===path.resolve(configPath))
  throw Error('Never overwrite the currently active private configuration');
 const output={
  schema:candidate.schema,syntheticOnly:true,pilotId:candidate.pilotId,
  role:candidate.role,area:candidate.area,stateDir:candidate.stateDir,
  listen:candidate.listen,allowPrivateLan:candidate.allowPrivateLan,
  remoteIp:candidate.remoteIp,remotePeerId:candidate.remotePeerId,
  remoteSeed:candidate.remoteSeed
 };
 let fd;
 try{
  fd=openSync(target,'wx',0o600);
  writeFileSync(fd,JSON.stringify(output,null,2)+'\n');
 }catch(error){
  if(fd!==undefined)try{unlinkSync(target);}catch{}
  throw error;
 }finally{if(fd!==undefined)closeSync(fd);}
 return Object.freeze({
  schema:'palantiny.private-peer-staging.v1',
  syntheticOnly:true,publicTestnetReady:false,
  pilotId:config.pilotId,ledgerRevision:expectedRevision,
  stagedPeerId:record.peerId,stagedConfigPath:target,
  activated:false,
  note:'Config staged offline; operator must review, independently verify the identity, and manually restart/reconfigure the pilot'
 });
}
