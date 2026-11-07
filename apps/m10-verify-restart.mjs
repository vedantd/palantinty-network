#!/usr/bin/env node
/**
 * Validate two CI Compose runs retained private node identities and histories.
 * Input files are test logs, not trusted network messages.
 */
import {readFileSync} from 'node:fs';
const [firstFile,secondFile]=process.argv.slice(2);
if(!firstFile||!secondFile)throw Error('Usage: node apps/m10-verify-restart.mjs first.log second.log');
function parse(filename){
 const events=readFileSync(filename,'utf8').split('\n').flatMap(line=>{
  const i=line.indexOf('{"role":');
  if(i<0)return [];
  try{return [JSON.parse(line.slice(i))];}catch{return [];}
 });
 const source=events.find(x=>x.role==='source'&&x.converged===true);
 const replica=events.find(x=>x.role==='replica'&&x.converged===true);
 if(!source||!replica)throw Error('Missing independent peer convergence evidence in '+filename);
 if(!source.peerId||!replica.peerId||source.peerId===replica.peerId)
   throw Error('Missing or colliding node identities');
 if(source.trustedReplica!==replica.peerId||
    source.accepted!==8||replica.accepted!==8||replica.agreements<1)
   throw Error('Source/replica state or Peer ID mismatch');
 if(source.runId!==replica.runId)throw Error('Mixed restart generations');
 return {source,replica};
}
const a=parse(firstFile),b=parse(secondFile);
if(a.runId===b.runId||a.source.runId===b.source.runId)
  throw Error('Restart run IDs did not change');
if(a.source.peerId!==b.source.peerId||a.replica.peerId!==b.replica.peerId)
  throw Error('Libp2p identities silently rotated after restart');
if(a.source.privateIp!==b.source.privateIp && !b.source.privateIp.startsWith('172.'))
  throw Error('Private network listener unexpectedly changed policy');
console.log(JSON.stringify({
  restartVerified:true,synthetic:true,
  sourcePeerId:a.source.peerId,replicaPeerId:a.replica.peerId,
  twoGenerations:[a.source.runId,b.source.runId],
  acceptedReportsPerIndexer:8,
  note:'Same physical runner; two isolated containers with preserved volumes. Not independent machine validation.'
},null,2));
