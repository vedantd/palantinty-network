import {verifyEnvelope} from './protocol.mjs';
import {createSyntheticIngressBudget} from './synthetic-ingress-budget.mjs';

const UTF8=new TextEncoder(),DECODER=new TextDecoder('utf-8',{fatal:true});
const MAX_PACKET=8_192;
const AREA=/^[a-z0-9][a-z0-9._-]{2,63}$/;
const SYNTHETIC_SCHEMA='palantiny.testnet.synthetic-gossip.v1';

export function syntheticTopic(area){
 if(typeof area!=='string'||!AREA.test(area))
  throw Error('Invalid synthetic-testnet area');
 return '/palantiny-network/testnet/synthetic/v1/'+area;
}
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&
 Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));

export function syntheticPacket(envelope){
 const body=verifyEnvelope(envelope);
 return Object.freeze({
  schema:SYNTHETIC_SCHEMA,syntheticOnly:true,
  area:body.report.area,envelope
 });
}
export function decodeSyntheticPacket(bytes,{area}={}){
 if(!(bytes instanceof Uint8Array)||bytes.byteLength===0||bytes.byteLength>MAX_PACKET)
  throw Error('Invalid synthetic-testnet packet size');
 const packet=JSON.parse(DECODER.decode(bytes));
 if(!exact(packet,['schema','syntheticOnly','area','envelope']) ||
    packet.schema!==SYNTHETIC_SCHEMA||packet.syntheticOnly!==true||
    typeof packet.area!=='string'||packet.area!==area||
    !AREA.test(packet.area))
  throw Error('Unrecognized synthetic-testnet packet');
 const body=verifyEnvelope(packet.envelope);
 if(body.report.area!==area)throw Error('Synthetic packet area mismatch');
 return Object.freeze({reportId:body.reportId,
  area:body.report.area,bucketStart:body.report.bucketStart,
  activityIndex:body.report.activityIndex,syntheticOnly:true});
}
export function encodeSyntheticPacket(envelope){
 const packet=syntheticPacket(envelope);
 const bytes=UTF8.encode(JSON.stringify(packet));
 if(bytes.byteLength>MAX_PACKET)throw Error('Oversized synthetic packet');
 return bytes;
}

/**
 * Bounded in-memory per-forwarding-peer arrival limiter (NOT Sybil defense).
 * Does not store a stable origin identity after its window expires.
 * For public use, real resource-manager and network-level quotas are needed.
 */
export function createSyntheticRateLimiter({
 maxPerPeer=16,windowMs=60_000,maxTrackedPeers=256,
 now=()=>Date.now()
}={}){
 for(const n of [maxPerPeer,windowMs,maxTrackedPeers])
  if(!Number.isSafeInteger(n)||n<1||n>1_000_000)
   throw new RangeError('Invalid testnet limiter bounds');
 if(typeof now!=='function')throw new TypeError('Clock required');
 const records=new Map();
 return Object.freeze({
  allow(peer){
   if(typeof peer!=='string'||!peer||peer.length>128)return false;
   const clock=now();
   if(!Number.isSafeInteger(clock)||clock<0)return false;
   for(const [key,record] of records){
    if(clock-record.started>=windowMs||clock<record.started)records.delete(key);
   }
   let record=records.get(peer);
   if(!record){
    if(records.size>=maxTrackedPeers)return false;
    record={started:clock,count:0};records.set(peer,record);
   }
   if(record.count>=maxPerPeer)return false;
   record.count++;
   return true;
  },
  tracked:()=>records.size
 });
}

/**
 * This is an isolated *observer*, never an indexer/report-ingest endpoint.
 * It exposes only sanitized synthetic event metadata, no signed envelopes,
 * public BLE identifiers, or privileged regional archive writes.
 */
export function observeSyntheticTopic(node,{
 area,onSynthetic=()=>{},limiter=createSyntheticRateLimiter(),
 budget=createSyntheticIngressBudget()
}={}){
 const topic=syntheticTopic(area);
 if(typeof onSynthetic!=='function'||typeof limiter?.allow!=='function'||
    typeof budget?.allowPacket!=='function'||typeof budget?.firstReport!=='function')
  throw new TypeError('Observer callback, limiter and ingress budget required');
 const counters={accepted:0,rejected:0,limited:0,duplicates:0,globalLimited:0};
 const handler=event=>{
  if(event.detail?.topic!==topic)return;
  // Global quota is charged before JSON decoding, independent of peer IDs.
  if(!budget.allowPacket(event.detail.data)){
   counters.globalLimited++;return;
  }
  const peer=event.detail?.from?.toString()??'unknown';
  if(!limiter.allow(peer)){counters.limited++;return;}
  try{
   const report=decodeSyntheticPacket(event.detail.data,{area});
   if(!budget.firstReport(report.reportId)){
    counters.duplicates++;return;
   }
   counters.accepted++;
   try{onSynthetic(report);}catch{} // No callback can corrupt pubsub handling.
  }catch{counters.rejected++;}
 };
 node.services.pubsub.addEventListener('message',handler);
 node.services.pubsub.subscribe(topic);
 let closed=false;
 return Object.freeze({
  topic,stats:()=>Object.freeze({...counters}),
  close:()=>{
   if(closed)return;closed=true;
   node.services.pubsub.removeEventListener('message',handler);
   node.services.pubsub.unsubscribe(topic);
  }
 });
}
export async function publishSynthetic(node,envelope){
 const body=verifyEnvelope(envelope);
 const topic=syntheticTopic(body.report.area);
 const bytes=encodeSyntheticPacket(envelope);
 const result=await node.services.pubsub.publish(topic,bytes);
 return Object.freeze({topic,reportId:body.reportId,
  peerFanout:result?.recipients?.length??null,
  delivered:false,ack:false,syntheticOnly:true});
}
