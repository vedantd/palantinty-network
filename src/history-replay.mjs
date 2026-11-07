import {parseLocalSeed} from './peer-bootstrap.mjs';
import {sendPrivateReport} from './private-transport.mjs';

/**
 * M09a: bounded sender-assisted reconciliation to an explicitly trusted
 * localhost regional indexer. Messages are exactly the original signed
 * envelopes, never re-signed or altered. No indexer-to-indexer sync yet.
 *
 * The receiving indexer must independently authenticate and authorize.
 * All ACKs are checked by sendPrivateReport before counting a success.
 */
export async function replaySignedHistory({
 node,outbox,peerAddress,area,maxReports=100
}={}) {
 if(!outbox || typeof outbox.signedHistory!=='function')
  throw new TypeError('Local signed outbox required');
 if(!Number.isSafeInteger(maxReports)||maxReports<1||maxReports>500)
  throw new RangeError('maxReports must be 1..500');
 const target=parseLocalSeed(peerAddress);
 let cursor=0,confirmed=0,accepted=0,duplicates=0;
 while(confirmed<maxReports){
  const batch=outbox.signedHistory({area,afterSequence:cursor,
    limit:Math.min(50,maxReports-confirmed)});
  if(!batch.length)return Object.freeze({
   confirmed,accepted,duplicates,hasMore:false,lastSequence:cursor
  });
  for(const envelope of batch){
   const result=await sendPrivateReport(node,target,envelope);
   if(result.ack!==true || !(result.accepted===true || result.duplicate===true))
    throw new Error('Reconciliation rejected report '+envelope.body.reportId+': '+result.code);
   confirmed++;
   accepted+=Number(result.accepted===true);
   duplicates+=Number(result.duplicate===true);
   cursor=envelope.body.sequence;
  }
 }
 const hasMore=outbox.signedHistory({area,afterSequence:cursor,limit:1}).length>0;
 return Object.freeze({confirmed,accepted,duplicates,hasMore,lastSequence:cursor});
}
