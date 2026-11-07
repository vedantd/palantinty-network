import {readFileSync,lstatSync} from 'node:fs';

const EVENT_SCHEMA='palantiny.p02c-pilot-evidence.v1';
const REPORT=/^[a-f0-9]{64}$/;
const PEER=/^[1-9A-HJ-NP-Za-km-z]{40,128}$/;
export function parseP02cPilotLog(content){
 if(typeof content!=='string'||Buffer.byteLength(content)>256*1024)
  throw Error('Pilot evidence log must be UTF-8 text at most 256 KiB');
 const lines=content.split(/\r?\n/).filter(line=>line.trim().length);
 if(lines.length<1||lines.length>1000)throw Error('Invalid pilot log length');
 return lines.map(line=>{
  if(Buffer.byteLength(line)>4096)throw Error('Oversized pilot log record');
  const item=JSON.parse(line);
  if(item===null||typeof item!=='object'||Array.isArray(item)||
     item.schema!==EVENT_SCHEMA||item.syntheticOnly!==true||
     item.realSensorData!==false||item.publicTestnetReady!==false||
     typeof item.pilotId!=='string'||!item.pilotId||
     !PEER.test(item.localPeerId)||!PEER.test(item.remotePeerId)||
     !['observer','publisher'].includes(item.role)||
     typeof item.event!=='string')
   throw Error('Malformed or non-synthetic pilot evidence record');
  return item;
 });
}
/**
 * Reconcile two independently captured process transcripts, but DO NOT treat
 * unsigned logs as proof of separate physical hosts or permissioned deployment.
 */
export function reviewP02cPilotEvidence(observerEvents,publisherEvents){
 if(!Array.isArray(observerEvents)||!Array.isArray(publisherEvents)||
    !observerEvents.length||!publisherEvents.length)
  throw Error('Both host transcripts are required');
 const ob=observerEvents[0],pub=publisherEvents[0];
 if(ob.role!=='observer'||pub.role!=='publisher'||ob.pilotId!==pub.pilotId||
    ob.localPeerId===pub.localPeerId||
    ob.remotePeerId!==pub.localPeerId||
    pub.remotePeerId!==ob.localPeerId)
  throw Error('Pilot ID and mutually pinned independent Peer IDs must agree');
 for(const events of [observerEvents,publisherEvents]){
  if(events.some(e=>e.role!==events[0].role||e.pilotId!==ob.pilotId||
    e.localPeerId!==events[0].localPeerId||e.remotePeerId!==events[0].remotePeerId))
   throw Error('Inconsistent pilot evidence transcript');
 }
 const received=new Set(observerEvents.filter(e=>
   e.event==='received-synthetic-report'&&e.deliveryObserved===true&&
   REPORT.test(e.reportId)).map(e=>e.reportId));
 const published=new Set(publisherEvents.filter(e=>
   e.event==='synthetic-published-no-ack'&&e.deliveryObserved===false&&
   e.delivered===false&&REPORT.test(e.reportId)).map(e=>e.reportId));
 const matched=[...received].filter(id=>published.has(id)).sort();
 if(!observerEvents.some(e=>e.event==='started')||
    !publisherEvents.some(e=>e.event==='started')||matched.length===0)
  throw Error('Missing independent signed-report receipt match');
 return Object.freeze({schema:'palantiny.p02c-evidence-review.v1',
  pilotId:ob.pilotId,syntheticOnly:true,remoteHostsVerified:false,
  publicTestnetReady:false,observationCount:matched.length,
  matchedReportIds:matched,distinctPeerIds:true,
  limitation:'Matching unsigned logs do not prove separate physical hosts, real delivery authenticity, firewall isolation or public release readiness'});
}
export function readP02cEvidenceFile(filename){
 const st=lstatSync(filename);
 if(!st.isFile()||st.isSymbolicLink()||st.size>256*1024||st.size===0)
  throw Error('Pilot evidence must be a regular, bounded text file');
 return parseP02cPilotLog(readFileSync(filename,'utf8'));
}
