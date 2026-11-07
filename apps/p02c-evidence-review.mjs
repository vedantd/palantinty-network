#!/usr/bin/env node
/** Offline review of two captured P02c host transcripts, not certification. */
import {readP02cEvidenceFile,reviewP02cPilotEvidence} from '../src/p02c-pilot-evidence.mjs';
const [observerFile,publisherFile,...extra]=process.argv.slice(2);
if(!observerFile||!publisherFile||extra.length){
 console.error('Usage: node apps/p02c-evidence-review.mjs <observer.ndjson> <publisher.ndjson>');
 process.exitCode=2;
}else{
 try{
  console.log(JSON.stringify(reviewP02cPilotEvidence(
   readP02cEvidenceFile(observerFile),
   readP02cEvidenceFile(publisherFile)
  ),null,2));
 }catch(error){
  console.error(error instanceof Error?error.message:String(error));
  process.exitCode=1;
 }
}
