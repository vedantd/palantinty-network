import { verifyEnvelope } from './protocol.mjs';

const LIMIT = 16_384;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal:true });
const AREA = /^[a-z0-9][a-z0-9._-]{2,63}$/;

/** Topic names are coarse-area labels, never exact sensor coordinates. */
export function topicForArea(area) {
  if (typeof area !== 'string' || !AREA.test(area))
    throw new Error('Invalid coarse area topic');
  return '/palantiny-network/aggregate/v1/' + area;
}

/**
 * M07 is synthetic, explicitly loopback-only GossipSub transport.
 * No public interface, discovery, real sensor publishing, or persistence.
 */
export async function createGossipNode({listen='/ip4/127.0.0.1/tcp/0',enableDht=false}={}) {
  if (typeof listen !== 'string' ||
      !/^\/ip4\/127\.0\.0\.1\/tcp\/(?:0|[1-9]\d{0,4})$/.test(listen))
    throw new Error('M07 only allows 127.0.0.1 loopback listeners');
  if(typeof enableDht!=='boolean')throw new TypeError('enableDht must be boolean');
  const [{createLibp2p},{tcp},{noise},{yamux},{identify},{gossipsub}]=
    await Promise.all([
      import('libp2p'), import('@libp2p/tcp'),
      import('@chainsafe/libp2p-noise'),import('@chainsafe/libp2p-yamux'),
      import('@libp2p/identify'), import('@libp2p/gossipsub')
    ]);
  const services={identify:identify(),pubsub:gossipsub({emitSelf:false})};
  if(enableDht){
    const {kadDHT}=await import('@libp2p/kad-dht');
    services.dht=kadDHT({protocol:'/palantiny-network/kad/1.0.0',
      clientMode:false,maxInboundStreams:8,maxOutboundStreams:8});
  }
  const node=await createLibp2p({
    addresses:{listen:[listen]},transports:[tcp()],
    connectionEncrypters:[noise()],streamMuxers:[yamux()],services
  });
  // Loopback-only DHT may serve routing queries; this MUST NOT be enabled
  // for public listeners before abuse/rate-limit and trust review.
  if(enableDht)await node.services.dht.setMode('server');
  return node;
}

/** Sending to GossipSub is NOT a durable receiver ACK. */
export async function publishSignedAggregate(node,envelope){
  const body=verifyEnvelope(envelope);
  const bytes=encoder.encode(JSON.stringify(envelope));
  if(bytes.byteLength>LIMIT)throw new Error('Oversized signed aggregate');
  const topic=topicForArea(body.report.area);
  const outcome=await node.services.pubsub.publish(topic,bytes);
  return {topic,reportId:body.reportId,peerFanout:outcome?.recipients?.length??null,
    delivered:false,ack:false};
}

/**
 * Regional recipients independently authenticate, authorize and persist.
 * A regional topic does not certify sensor location or contributor identity.
 * No application ACK is generated. A relay can subscribe without ingest.
 */
export function subscribeRegionalAggregates(node,{area,ingest,onOutcome=()=>{}}={}){
  if(!ingest || typeof ingest.ingest!=='function')
    throw new TypeError('Regional ingest must provide ingest(envelope)');
  if(typeof onOutcome!=='function')throw new TypeError('onOutcome must be a function');
  const topic=topicForArea(area);
  const metrics={accepted:0,duplicate:0,rejected:0,storageErrors:0};
  const handler=evt=>{
    if(evt.detail?.topic!==topic)return;
    let outcome;
    try {
      const bytes=evt.detail.data;
      if(!(bytes instanceof Uint8Array)||bytes.byteLength>LIMIT)
        throw new Error('Invalid message size');
      const envelope=JSON.parse(decoder.decode(bytes));
      const body=verifyEnvelope(envelope);
      if(body.report.area!==area)throw new Error('Area/topic mismatch');
      outcome=ingest.ingest(envelope);
      if(outcome?.accepted)metrics.accepted++;
      else if(outcome?.duplicate)metrics.duplicate++;
      else metrics.rejected++;
    }catch(error){
      metrics.rejected++;
      metrics.storageErrors+=Number(error?.code==='SQLITE_ERROR'||String(error).includes('database'));
      outcome={accepted:false,ack:false,code:'invalid_or_storage_failure'};
    }
    // This callback is observational, never a transport acknowledgment.
    try { onOutcome(Object.freeze({accepted:outcome.accepted===true,code:outcome.code})); }
    catch { /* user observer cannot stop gossip handling */ }
  };
  node.services.pubsub.addEventListener('message',handler);
  node.services.pubsub.subscribe(topic);
  let closed=false;
  return Object.freeze({
    topic,
    stats:()=>Object.freeze({...metrics}),
    close(){
      if(closed)return;
      closed=true;
      node.services.pubsub.removeEventListener('message',handler);
      node.services.pubsub.unsubscribe(topic);
    }
  });
}

export function subscribeRelay(node,area) {
  const topic=topicForArea(area);
  node.services.pubsub.subscribe(topic);
  return {topic,close:()=>node.services.pubsub.unsubscribe(topic)};
}
