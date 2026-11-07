import {lstatSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {parseTrustedListen,isTrustedAddressIp} from './private-lan-policy.mjs';
import {validatePinnedSyntheticSeed} from './synthetic-network-policy.mjs';

const FIELDS=['schema','syntheticOnly','pilotId','role','area','stateDir',
 'listen','allowPrivateLan','remoteIp','remotePeerId','remoteSeed'];
const PEER=/^[1-9A-HJ-NP-Za-km-z]{40,128}$/;
const AREA=/^synthetic-[a-z0-9._-]{3,55}$/;
const PILOT=/^[a-z0-9][a-z0-9-]{4,47}$/;
const exact=(value,fields)=>value!==null&&typeof value==='object'&&
 !Array.isArray(value)&&Object.keys(value).length===fields.length&&
 fields.every(field=>Object.hasOwn(value,field));

/**
 * P02c-2 operator-owned configuration. Neither the runtime nor CI discovers
 * peers, distributes trust, loads live sensor input, or enables public bind.
 */
export function validateP02cHostConfig(config){
 if(!exact(config,FIELDS)||config.schema!=='palantiny.p02c-host-pilot.v1'||
    config.syntheticOnly!==true||typeof config.pilotId!=='string'||
    !PILOT.test(config.pilotId)||
    !['observer','publisher'].includes(config.role)||
    typeof config.area!=='string'||!AREA.test(config.area)||
    typeof config.stateDir!=='string'||!path.isAbsolute(config.stateDir)||
    typeof config.listen!=='string'||typeof config.allowPrivateLan!=='boolean'||
    typeof config.remoteIp!=='string'||
    !isTrustedAddressIp(config.remoteIp,{allowPrivateLan:config.allowPrivateLan})||
    typeof config.remotePeerId!=='string'||!PEER.test(config.remotePeerId)||
    typeof config.remoteSeed!=='string')
   throw Error('Invalid, non-private, or non-synthetic P02c host pilot configuration');
 parseTrustedListen(config.listen,{allowPrivateLan:config.allowPrivateLan});
 if(config.role==='observer'&&config.listen.endsWith('/tcp/0'))
  throw Error('Observer requires a fixed private TCP listen port');
 const ips=config.remoteIp==='127.0.0.1'?[]:[config.remoteIp];
 if(config.allowPrivateLan&&ips.length!==1)
  throw Error('Private overlay pilot requires a concrete remote RFC1918 address');
 if(!config.remoteSeed.startsWith('/ip4/'+config.remoteIp+'/tcp/'))
  throw Error('Pinned seed must use the exact independently verified remote IP');
 validatePinnedSyntheticSeed(config.remoteSeed,{
  allowedPeerIds:[config.remotePeerId],allowPrivateLan:config.allowPrivateLan,
  allowedRemoteIps:ips
 });
 return Object.freeze({...config,allowedRemoteIps:Object.freeze(ips)});
}
export function readP02cHostConfig(filename){
 if(typeof filename!=='string'||filename.length===0)
  throw TypeError('Private configuration path required');
 const stat=lstatSync(filename);
 if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)
  throw Error('P02c configuration must be a private regular 0600 file');
 if(stat.size>8192||stat.size===0)throw Error('Invalid P02c configuration file size');
 return validateP02cHostConfig(JSON.parse(readFileSync(filename,'utf8')));
}
