#!/usr/bin/env node
/**
 * Offline process-log consistency review for P02c-4.
 * Never writes readiness flags or certifies separately administered hosts.
 */
import {readP02cEvidenceFile} from '../src/p02c-pilot-evidence.mjs';
import {reviewP02cIncidentDrill} from '../src/p02c-incident-review.mjs';
const args=process.argv.slice(2);
if(args.length!==6){
 console.error('Usage: node apps/p02c-incident-review.mjs <baseline-observer.ndjson> <baseline-publisher.ndjson> <outage-publisher.ndjson> <outage-exit-code> <recovery-observer.ndjson> <recovery-publisher.ndjson>');
 process.exitCode=2;
}else{
 try{
  const [bo,bp,op,exit,ro,rp]=args;
  if(!/^[1-9][0-9]{0,2}$/.test(exit)||Number(exit)>255)
   throw Error('Outage exit code must be 1..255');
  const verdict=reviewP02cIncidentDrill({
   baselineObserver:readP02cEvidenceFile(bo),
   baselinePublisher:readP02cEvidenceFile(bp),
   outagePublisher:readP02cEvidenceFile(op),
   outageExitCode:Number(exit),
   recoveryObserver:readP02cEvidenceFile(ro),
   recoveryPublisher:readP02cEvidenceFile(rp)
  });
  console.log(JSON.stringify(verdict,null,2));
 }catch(error){
  console.error(error instanceof Error?error.message:String(error));
  process.exitCode=1;
 }
}
