import {randomBytes} from 'node:crypto';
import {publicKeyToProtobuf,publicKeyFromProtobuf} from '@libp2p/crypto/keys';
import {peerIdFromPrivateKey,peerIdFromPublicKey,peerIdFromString} from '@libp2p/peer-id';
import {JsonLineDecoder} from './jsonl.mjs';
import {parseSyntheticRegionKey} from './private-synthetic-region.mjs';

/**
 * D03 private, fictional-only read model. DHT discovery and signing keys
 * establish indexer identity, not ground truth, geography or sensor quality.
 * Refuse public transport, raw signed reports and unbounded queries.
 */
export const PRIVATE_SYNTHETIC_QUERY_PROTOCOL='/palantiny-network/private-synthetic-query/0.1.0';
const QUERY='palantiny.private-synthetic-query.request.v1';
const REPLY='palantiny.private-synthetic-query.reply.v1';
const PREFIX=new TextEncoder().encode('palantiny.private-synthetic-query.signed.v1\0');
const ENCODER=new TextEncoder();
const MAX_FRAME=8192, MAX_ROWS=16, DELAY=15*60_000, DAY=24*60*60_000;
const FIELDS=['schema','peerId','region','start','end','limit','nonce','issuedAt','expiresAt','rows'];
const ROW=['area','bucketStart','bucketSeconds','sources','relativeBleActivity','status'];
const exact=(o,keys)=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&
 Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
const isLoopback=addr=>typeof addr==='string'&&
 /^\/ip4\/127\.0\.0\.1\/tcp\/[0-9]+(?:\/p2p\/[a-zA-Z0-9]+)?$/.test(addr);
function nodePrivate(node) {
 const addrs=node?.getMultiaddrs?.().map(a=>a.toString());
 if(!node?.handle||!addrs?.length||addrs.some(a=>!isLoopback(a)))
  throw Error('D03 requires a private loopback-only libp2p node');
}
const encode=value=>{
 const bytes=ENCODER.encode(JSON.stringify(value)+'\n');
 if(bytes.byteLength>MAX_FRAME)throw Error('D03 frame too large');
 return bytes;
};
const base64=(value,max)=>{
 if(typeof value!=='string'||value.length<1||value.length>Math.ceil(max/3)*4+4||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value))throw Error('Bad base64');
 const bytes=Buffer.from(value,'base64');
 if(!bytes.length||bytes.length>max||bytes.toString('base64')!==value)throw Error('Noncanonical base64');
 return bytes;
};
export function syntheticAreaForRegion(region){
 const {scenario,cellIndex}=parseSyntheticRegionKey(region);
 return 'synthetic-'+scenario+'-'+cellIndex.toString(36).padStart(2,'0');
}
function validRequest(req,now){
 if(!exact(req,['schema','region','start','end','limit','nonce'])||
    req.schema!==QUERY)throw Error('Invalid D03 query schema');
 parseSyntheticRegionKey(req.region);
 if(!Number.isSafeInteger(now)||!Number.isSafeInteger(req.start)||
    !Number.isSafeInteger(req.end)||req.start<0||req.start>=req.end||
    req.start<now-DAY||req.end>now-DELAY||req.end-req.start>DAY||
    !Number.isSafeInteger(req.limit)||req.limit<1||req.limit>MAX_ROWS||
    typeof req.nonce!=='string'||!/^[A-Za-z0-9_-]{22}$/.test(req.nonce)||
    Buffer.from(req.nonce,'base64url').toString('base64url')!==req.nonce)
  throw Error('Invalid D03 bounded query window, limit or nonce');
 return req;
}
export function validateSyntheticRows(rows,request,now){
 validRequest(request,now);
 if(!Array.isArray(rows)||rows.length>request.limit)throw Error('Invalid D03 row count');
 const area=syntheticAreaForRegion(request.region);
 let prev=-1;
 for(const row of rows){
  if(!exact(row,ROW)||row.area!==area||
     !Number.isSafeInteger(row.bucketStart)||row.bucketStart<=prev||
     row.bucketStart<request.start||row.bucketStart>=request.end||
     !Number.isSafeInteger(row.bucketSeconds)||row.bucketSeconds<10||
     row.bucketSeconds>3600||row.bucketStart+row.bucketSeconds*1000>now-DELAY||
     !Number.isSafeInteger(row.sources)||row.sources<2||row.sources>100000||
     !Number.isSafeInteger(row.relativeBleActivity)||
     row.relativeBleActivity<0||row.relativeBleActivity>1000000||
     row.status!=='experimental_synthetic_only')
   throw Error('Unreleased, unthresholded or malformed D03 aggregate');
  prev=row.bucketStart;
 }
 return rows;
}
function signedBytes(payload,request,now){
 if(!exact(payload,FIELDS)||payload.schema!==REPLY||
    payload.region!==request.region||payload.start!==request.start||
    payload.end!==request.end||payload.limit!==request.limit||
    payload.nonce!==request.nonce||
    typeof payload.peerId!=='string'||
    !Number.isSafeInteger(payload.issuedAt)||
    !Number.isSafeInteger(payload.expiresAt)||payload.issuedAt>now||
    payload.expiresAt<=now||payload.expiresAt-payload.issuedAt>60_000||
    payload.expiresAt<=payload.issuedAt)
  throw Error('Invalid D03 signed response');
 validateSyntheticRows(payload.rows,request,now);
 const values=FIELDS.map(k=>k==='rows'?
  payload.rows.map(row=>ROW.map(r=>row[r])):payload[k]);
 return Buffer.concat([PREFIX,Buffer.from(JSON.stringify(values))]);
}
export async function signPrivateSyntheticReply(payload,privateKey,request,now){
 if(privateKey?.type!=='Ed25519'||!privateKey.publicKey||
    peerIdFromPrivateKey(privateKey).toString()!==payload.peerId)
  throw Error('D03 signer must equal private node Peer ID');
 const bytes=signedBytes(payload,request,now);
 const reply={payload,
  publicKey:Buffer.from(publicKeyToProtobuf(privateKey.publicKey)).toString('base64'),
  signature:Buffer.from(await privateKey.sign(bytes)).toString('base64')};
 encode(reply);
 return reply;
}
export async function verifyPrivateSyntheticReply(reply,{
 request,expectedPeerId,approvedIndexerPeerIds,now=Date.now()
}={}){
 try{
  if(!exact(reply,['payload','publicKey','signature'])||
     !(approvedIndexerPeerIds instanceof Set)||
     !approvedIndexerPeerIds.has(expectedPeerId)||
     reply.payload.peerId!==expectedPeerId)return false;
  const bytes=signedBytes(reply.payload,request,now);
  const key=publicKeyFromProtobuf(base64(reply.publicKey,512));
  if(key.type!=='Ed25519'||peerIdFromPublicKey(key).toString()!==expectedPeerId)
   return false;
  const signature=base64(reply.signature,64);
  return signature.length===64&&await key.verify(bytes,signature)===true;
 }catch{return false;}
}

/** A missing or disputed record must never be represented as a zero reading. */
export function comparePrivateSyntheticRows(results,request,now=Date.now()){
 validRequest(request,now);
 if(!Array.isArray(results)||results.length!==2||
    results[0]?.peerId===results[1]?.peerId||
    results.some(r=>typeof r?.peerId!=='string'||
      !Array.isArray(r.rows)))throw Error('Two distinct authenticated indexers required');
 for(const r of results)validateSyntheticRows(r.rows,request,now);
 const equal=JSON.stringify(results[0].rows)===JSON.stringify(results[1].rows);
 return Object.freeze({status:equal?
  (results[0].rows.length?'consistent':'no-data'):'disagreement',
  rows:equal&&results[0].rows.length?results[0].rows:[],
  indexerPeerIds:results.map(r=>r.peerId),sources:2,
  independentlyOperatedHostsVerified:false});
}

/** Private read service does not expose signer IDs, raw archive or statistics. */
export function registerPrivateSyntheticQuery(node,{
 privateKey,region,ingest,approvedClientPeerIds,clock=()=>Date.now()
}={}){
 nodePrivate(node);
 const peerId=peerIdFromPrivateKey(privateKey).toString();
 if(node.peerId.toString()!==peerId||!ingest||
    typeof ingest.query!=='function'||ingest.minOperators<2||
    !(approvedClientPeerIds instanceof Set)||approvedClientPeerIds.size<1||
    typeof clock!=='function')throw Error('D03 requires an approved thresholded private indexer');
 syntheticAreaForRegion(region);
 const stats={served:0,denied:0,invalid:0};
 const handler=(stream,connection)=>{
  const remote=connection?.remotePeer?.toString();
  if(!remote||!approvedClientPeerIds.has(remote)||
     !isLoopback(connection?.remoteAddr?.toString())){
   stats.denied++;stream.abort(new Error('D03 unauthorized client'));return;
  }
  let handled=false;
  const decoder=new JsonLineDecoder({maxLineBytes:MAX_FRAME,
   onDropped:()=>{stats.invalid++;stream.abort(new Error('D03 oversized request'));},
   onLine:line=>{
    if(handled){stats.invalid++;stream.abort(new Error('D03 duplicate request'));return;}
    handled=true;
    void (async()=>{
     try{
      const now=clock(),req=validRequest(JSON.parse(line),now);
      if(req.region!==region)throw Error('D03 unserved fictional region');
      const rows=ingest.query({area:syntheticAreaForRegion(region),
       start:req.start,end:req.end,limit:req.limit});
      validateSyntheticRows(rows,req,now);
      const payload={schema:REPLY,peerId,region,start:req.start,end:req.end,
       limit:req.limit,nonce:req.nonce,issuedAt:now,expiresAt:now+30_000,rows};
      stream.send(encode({schema:REPLY,reply:await signPrivateSyntheticReply(
       payload,privateKey,req,now)}));
      stats.served++;
      await stream.close();
     }catch{
      stats.invalid++;stream.abort(new Error('D03 invalid private read'));
     }
    })();
   }});
  stream.addEventListener('message',event=>decoder.push(event.data.subarray()));
  stream.addEventListener('error',()=>{});
 };
 node.handle(PRIVATE_SYNTHETIC_QUERY_PROTOCOL,handler,{
  maxInboundStreams:2,maxOutboundStreams:2
 });
 return Object.freeze({stats:()=>Object.freeze({...stats}),
  close:()=>node.unhandle(PRIVATE_SYNTHETIC_QUERY_PROTOCOL)});
}
async function readPeer(node,discovered,req,approvedIndexerPeerIds,timeoutMs,clock){
 const peerId=discovered.peerId;
 if(!discovered.verified||discovered.region!==req.region||
    !approvedIndexerPeerIds.has(peerId)||discovered.expiresAt<=clock())
  throw Error('D03 requires current verified approved coverage');
 const id=peerIdFromString(peerId);
 const connections=node.getConnections(id);
 if(!connections.length||connections.some(c=>
    c.remotePeer.toString()!==peerId||!isLoopback(c.remoteAddr.toString())))
  throw Error('D03 refuses non-loopback or unauthenticated peer connection');
 const stream=await node.dialProtocol(id,PRIVATE_SYNTHETIC_QUERY_PROTOCOL,{
  signal:AbortSignal.timeout(timeoutMs)
 });
 return new Promise((resolve,reject)=>{
  let done=false;
  const settle=(err,rows)=>{
   if(done)return;done=true;clearTimeout(timer);
   void stream.close().catch(()=>{});
   if(err)reject(err);else resolve(Object.freeze({peerId,rows}));
  };
  const timer=setTimeout(()=>settle(Error('D03 timed out')),timeoutMs);
  const decoder=new JsonLineDecoder({maxLineBytes:MAX_FRAME,
   onDropped:()=>settle(Error('D03 oversized response')),
   onLine:line=>{
    void (async()=>{
     try{
      const msg=JSON.parse(line);
      if(!exact(msg,['schema','reply'])||msg.schema!==REPLY||
         !await verifyPrivateSyntheticReply(msg.reply,{
          request:req,expectedPeerId:peerId,approvedIndexerPeerIds,now:clock()
         }))throw Error('D03 peer-bound signed response refused');
      settle(null,msg.reply.payload.rows);
     }catch(e){settle(e);}
    })();
   }});
  stream.addEventListener('message',event=>{
   if(!done)decoder.push(event.data.subarray());
  });
  stream.addEventListener('error',event=>
   settle(event.error??Error('D03 private stream error')));
  try{stream.send(encode(req));}catch(e){settle(e);}
 });
}
/**
 * D02a provides the actual region→provider candidates and signed coverage.
 * D03 fetches bounded, thresholded aggregates from two of those candidates;
 * it never treats an empty or disagreeing archive as a real zero.
 */
export async function queryDiscoveredPrivateRegion(node,{
 region,discovery,approvedIndexerPeerIds,start,end,limit=16,
 timeoutMs=6_000,clock=()=>Date.now()
}={}){
 nodePrivate(node);
 if(!(approvedIndexerPeerIds instanceof Set)||
    !Number.isSafeInteger(timeoutMs)||timeoutMs<250||timeoutMs>60_000||
    typeof clock!=='function'||discovery?.region!==region||
    !Array.isArray(discovery.results)||discovery.results.length<2)
  throw Error('D03 requires two D02a discovered private indexers');
 const req=validRequest({schema:QUERY,region,start,end,limit,
  nonce:randomBytes(16).toString('base64url')},clock());
 const candidates=discovery.results.slice(0,2);
 if(new Set(candidates.map(x=>x.peerId)).size!==2)
  throw Error('D03 duplicate indexer Peer IDs');
 const rows=await Promise.all(candidates.map(p=>
  readPeer(node,p,req,approvedIndexerPeerIds,timeoutMs,clock)));
 return Object.freeze({schema:'palantiny.private-synthetic-query.result.v1',
  region,query:{start,end,limit},...comparePrivateSyntheticRows(rows,req,clock()),
  privateTransport:true,publicNetwork:false,realSensing:false});
}
