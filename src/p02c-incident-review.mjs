import {reviewP02cPilotEvidence} from './p02c-pilot-evidence.mjs';

const EVENTS=['started','connection-health','synthetic-published-no-ack',
 'received-synthetic-report','observer-complete','local-shutdown'];
const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);

/**
 * Check an explicitly staged private-pilot incident exercise.
 *
 * No telemetry can authenticate a physical host, a firewall rule, or an
 * independent operator. A reviewer must separately examine that evidence.
 */
export function reviewP02cIncidentDrill({
 baselineObserver,baselinePublisher,
 outagePublisher,outageExitCode,
 recoveryObserver,recoveryPublisher
}={}){
 const baseline=reviewP02cPilotEvidence(baselineObserver,baselinePublisher);
 const recovery=reviewP02cPilotEvidence(recoveryObserver,recoveryPublisher);
 if(baseline.pilotId!==recovery.pilotId)
  throw Error('Recovery must use the same private synthetic pilot');
 const firstObserver=baselineObserver[0],firstPublisher=baselinePublisher[0];
 const resumedObserver=recoveryObserver[0],resumedPublisher=recoveryPublisher[0];
 if(firstObserver.localPeerId!==resumedObserver.localPeerId||
   firstObserver.remotePeerId!==resumedObserver.remotePeerId||
   firstPublisher.localPeerId!==resumedPublisher.localPeerId||
   firstPublisher.remotePeerId!==resumedPublisher.remotePeerId)
  throw Error('Recovery must retain both independently provisioned pinned Peer IDs');
 if(!Array.isArray(outagePublisher)||outagePublisher.length<1||
    outagePublisher.length>1000||
    !Number.isSafeInteger(outageExitCode)||outageExitCode<1||outageExitCode>255)
  throw Error('Outage requires a recorded nonzero publisher process exit code');
 if(outagePublisher.some(event=>!isRecord(event)||
    event.schema!=='palantiny.p02c-pilot-evidence.v1'||
    event.syntheticOnly!==true||event.publicTestnetReady!==false||
    event.realSensorData!==false||event.role!=='publisher'||
    event.pilotId!==baseline.pilotId||
    event.localPeerId!==firstPublisher.localPeerId||
    event.remotePeerId!==firstPublisher.remotePeerId||
    typeof event.event!=='string'||!EVENTS.includes(event.event)))
  throw Error('Outage transcript is not the same synthetic pinned publisher');
 if(!outagePublisher.some(event=>event.event==='started')||
    outagePublisher.some(event=>
     event.event==='synthetic-published-no-ack'||
     event.event==='received-synthetic-report'||
     event.deliveryObserved===true))
  throw Error('Outage must show a started publisher without successful publish/receipt');
 const before=new Set(baseline.matchedReportIds);
 const after=new Set(recovery.matchedReportIds);
 if([...after].some(reportId=>before.has(reportId)))
  throw Error('Recovery must produce a new signed synthetic report, not replay');
 return Object.freeze({
  schema:'palantiny.p02c-incident-review.v1',
  pilotId:baseline.pilotId,
  syntheticOnly:true,
  localDrillSequenceConsistent:true,
  persistentPeerIdsMatch:true,
  baselineReceipts:before.size,
  recoveryReceipts:after.size,
  failedPublisherExitRecorded:true,
  publicTestnetReady:false,
  remoteHostsVerified:false,
  overlayFirewallVerified:false,
  independentOperatorReviewRequired:true,
  note:'Self-reported process logs/exit code cannot verify physical machines, firewall failure injection, or independent operator review'
 });
}
