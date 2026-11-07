import {JsonLineDecoder} from './jsonl.mjs';
import {verifyEnvelope} from './protocol.mjs';
import {parseLocalSeed} from './peer-bootstrap.mjs';

export const INDEXER_SYNC_PROTOCOL='/palantiny-network/indexer-sync/0.1.0';
const MAX_FRAME=16_384;
const MAX_PAGE=8;
const MAX_REPORTS=128;
const SUMMARY_REQUEST='palantiny.indexer-sync.summary-request.v1';
const SUMMARY_RESPONSE='palantiny.indexer-sync.summary-response.v1';
const UTF8=new TextEncoder();
const AREA=/^[a-z0-9][a-z0-9._-]{2,63}$/;
const HASH=/^[a-f0-9]{64}$/;
const own=(object,fields)=>object&&typeof object==='object'&&!Array.isArray(object)&&
  Object.keys(object).length===fields.length&&fields.every(x=>Object.hasOwn(object,x));

function encodeFrame(value) {
 const bytes=UTF8.encode(JSON.stringify(value)+'\n');
 if(bytes.byteLength>MAX_FRAME)throw new Error('Indexer sync frame too large');
 return bytes;
}
function validRequest(request,area) {
 return own(request,['schema','area','after','limit']) &&
   request.schema==='palantiny.indexer-sync.request.v1'&&request.area===area &&
   typeof request.after==='string'&&(request.after===''||HASH.test(request.after))&&
   Number.isSafeInteger(request.limit)&&request.limit>=1&&request.limit<=MAX_PAGE;
}
function validatePage(response,{area,after,limit}) {
 if(!own(response,['schema','area','after','next','hasMore','envelopes']) ||
   response.schema!=='palantiny.indexer-sync.response.v1'||
   response.area!==area||response.after!==after||
   typeof response.next!=='string'||(response.next!==''&&!HASH.test(response.next))||
   typeof response.hasMore!=='boolean'||!Array.isArray(response.envelopes)||
   response.envelopes.length>limit||response.envelopes.length>MAX_PAGE||
   (response.hasMore && response.envelopes.length===0))
   throw new Error('Invalid indexer sync response');
 let cursor=after;
 for(const envelope of response.envelopes){
   const body=verifyEnvelope(envelope);
   if(body.report.area!==area || body.reportId<=cursor)
     throw new Error('Unordered, duplicate or wrong-area signed sync report');
   cursor=body.reportId;
 }
 if(response.next!==cursor)throw new Error('Incorrect indexer sync cursor');
 return response;
}

/**
 * Accept only Noise-authenticated libp2p PeerIDs in an explicit allowlist.
 * The peer identity is read from the encrypted transport connection, never
 * from an untrusted request field. No generic indexer data-export endpoint.
 */
export function registerTrustedIndexerSync(node,{index,area,allowedPeers}={}) {
 if(!index||typeof index.signedArchivePage!=='function'||
   !(allowedPeers instanceof Set)||allowedPeers.size===0||
   [...allowedPeers].some(p=>typeof p!=='string'||!p.trim())||
   typeof area!=='string'||!AREA.test(area))
   throw new TypeError('Explicit index, area and trusted indexer PeerIDs required');
 const metrics={authorized:0,denied:0,invalid:0,served:0};
 const handler=(stream,connection)=>{
   const remotePeer=connection?.remotePeer?.toString();
   const remoteAddr=connection?.remoteAddr?.toString()??'';
   if(!remotePeer||!allowedPeers.has(remotePeer)||
      !remoteAddr.includes('/ip4/127.0.0.1/')){
     metrics.denied++;
     stream.abort(new Error('Unauthorized indexer peer'));return;
   }
   metrics.authorized++;
   let handled=false;
   const decoder=new JsonLineDecoder({
     maxLineBytes:MAX_FRAME,
     onDropped:()=>{metrics.invalid++;stream.abort(new Error('Oversized indexer request'));},
     onLine:line=>{
       if(handled){metrics.invalid++;stream.abort(new Error('Multiple indexer requests'));return;}
       handled=true;
       let response;
       try{
         const request=JSON.parse(line);
         if(own(request,['schema','area']) &&
             request.schema===SUMMARY_REQUEST && request.area===area) {
           if(typeof index.signedArchiveSummary!=='function')
             throw new Error('Archive summary unavailable');
           response={schema:SUMMARY_RESPONSE,area,
             ...index.signedArchiveSummary({area})};
         } else {
           if(!validRequest(request,area))throw new Error('Invalid request');
           const page=index.signedArchivePage({area,after:request.after,limit:request.limit});
           response={schema:'palantiny.indexer-sync.response.v1',
             area,after:request.after,next:page.next,hasMore:page.hasMore,
             envelopes:page.envelopes};
         }
         const bytes=encodeFrame(response);
         stream.send(bytes);
         metrics.served++;
         void stream.close().catch(()=>{});
       }catch{
         metrics.invalid++;
         stream.abort(new Error('Indexer sync refused request'));
       }
     }
   });
   stream.addEventListener('message',event=>decoder.push(event.data.subarray()));
   stream.addEventListener('error',()=>{});
   stream.addEventListener('remoteCloseWrite',()=>{
     if(!handled)void stream.close().catch(()=>{});
   });
 };
 node.handle(INDEXER_SYNC_PROTOCOL,handler,{maxInboundStreams:2,maxOutboundStreams:2});
 return Object.freeze({
   stats:()=>Object.freeze({...metrics}),
   close:()=>node.unhandle(INDEXER_SYNC_PROTOCOL)
 });
}
async function fetchFrame(node,peer,request,{validate,timeoutMs=5000}) {
 const stream=await node.dialProtocol(peer,INDEXER_SYNC_PROTOCOL);
 return new Promise((resolve,reject)=>{
   let done=false;
   const settle=(error,value)=>{
     if(done)return;done=true;clearTimeout(timer);
     void stream.close().catch(()=>{});
     if(error)reject(error);else resolve(value);
   };
   const timer=setTimeout(()=>settle(new Error('Indexer sync timeout')),timeoutMs);
   const decoder=new JsonLineDecoder({
     maxLineBytes:MAX_FRAME,
     onDropped:()=>settle(new Error('Oversized indexer sync response')),
     onLine:line=>{
       try{settle(null,validate(JSON.parse(line)));}
       catch(error){settle(error);}
     }
   });
   stream.addEventListener('message',event=>{
     if(!done)decoder.push(event.data.subarray());
   });
   stream.addEventListener('error',event=>settle(event.error??new Error('Indexer sync stream error')));
   try{stream.send(encodeFrame(request));}catch(error){settle(error);}
 });
}

async function fetchPage(node,peer,{area,after,limit,timeoutMs=5000}) {
  return fetchFrame(node,peer,{
    schema:'palantiny.indexer-sync.request.v1',area,after,limit
  },{timeoutMs,validate:response=>validatePage(response,{area,after,limit})});
}

/** Get a bounded, archive-only consistency summary from a trusted indexer. */
export async function fetchTrustedIndexerSummary({
  node,peerAddress,allowedSourcePeerIds,area,timeoutMs=5000
}={}) {
  if(!(allowedSourcePeerIds instanceof Set)||allowedSourcePeerIds.size===0)
    throw new TypeError('Explicit trusted source indexer PeerIDs required');
  if(typeof area!=='string'||!AREA.test(area))throw new Error('Invalid regional sync area');
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>60_000)
    throw new RangeError('Indexer summary timeout invalid');
  const peer=parseLocalSeed(peerAddress);
  if(!allowedSourcePeerIds.has(peerAddress.split('/').at(-1)))
    throw new Error('Untrusted source indexer PeerID');
  return fetchFrame(node,peer,{schema:SUMMARY_REQUEST,area},{
    timeoutMs,
    validate:response=>{
      if(!own(response,['schema','area','count','digest'])||
         response.schema!==SUMMARY_RESPONSE||response.area!==area||
         !Number.isSafeInteger(response.count)||response.count<0||
         typeof response.digest!=='string'||!HASH.test(response.digest))
        throw new Error('Invalid indexer archive summary');
      return Object.freeze({count:response.count,digest:response.digest});
    }
  });
}

/**
 * A receiving indexer pulls signed historical reports from an explicitly
 * trusted indexer over authenticated, encrypted libp2p. It independently
 * verifies every signature and uses existing durable ingest transactions.
 * Failure stops without advancing a persisted cursor; a restart safely
 * replays acknowledged reports as duplicates.
 */
export async function synchronizeTrustedIndexer({
 node,index,peerAddress,allowedSourcePeerIds,area,maxReports=MAX_REPORTS,
 pageSize=MAX_PAGE,timeoutMs=5000,afterReportId='',onPage=()=>{}
}={}) {
 if(!index||typeof index.ingest!=='function')throw new TypeError('Durable indexer required');
 if(!(allowedSourcePeerIds instanceof Set)||allowedSourcePeerIds.size===0)
   throw new TypeError('Explicit trusted source indexer PeerIDs required');
 if(!Number.isSafeInteger(maxReports)||maxReports<1||maxReports>MAX_REPORTS||
    !Number.isSafeInteger(pageSize)||pageSize<1||pageSize>MAX_PAGE||
    !Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>60_000)
   throw new RangeError('Indexer sync bounds invalid');
 if(typeof area!=='string'||!AREA.test(area))throw new Error('Invalid regional sync area');
 if(typeof afterReportId!=='string'||(afterReportId!==''&&!HASH.test(afterReportId)))
   throw new Error('Invalid reconciliation cursor');
 if(typeof onPage!=='function')throw new TypeError('onPage must be a function');
 const target=parseLocalSeed(peerAddress);
 const peerId=peerAddress.split('/').at(-1);
 if(!allowedSourcePeerIds.has(peerId))throw new Error('Untrusted source indexer PeerID');
 let after=afterReportId,confirmed=0,accepted=0,duplicate=0,pages=0,hasMore=false;
 while(confirmed<maxReports){
   const page=await fetchPage(node,target,{area,after,
     limit:Math.min(pageSize,maxReports-confirmed),timeoutMs});
   pages++;
   for(const envelope of page.envelopes){
     const result=index.ingest(envelope);
     if(result.ack!==true || (result.accepted!==true && result.duplicate!==true))
       throw new Error('Indexer reconciliation rejected signed report: '+result.code);
     confirmed++;
     accepted+=Number(result.accepted===true);
     duplicate+=Number(result.duplicate===true);
   }
   // A cursor is safe to checkpoint only after every report in its page
   // has committed (or was verified as already committed).
   after=page.next;hasMore=page.hasMore;
   onPage(Object.freeze({lastReportId:after,hasMore,confirmed,accepted,duplicate,pages}));
   if(!hasMore||page.envelopes.length===0)break;
 }
 return Object.freeze({confirmed,accepted,duplicate,pages,hasMore,lastReportId:after});
}
