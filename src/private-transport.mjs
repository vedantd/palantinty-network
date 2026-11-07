import { JsonLineDecoder } from './jsonl.mjs';
import { verifyEnvelope } from './protocol.mjs';

export const PULSE_PROTOCOL = '/pulsemesh/private-aggregate/0.1.0';
const MAX_FRAME_BYTES = 16_384;
const UTF8 = new TextEncoder();

/**
 * Explicit opt-in, localhost-only encrypted P2P transport.
 * Using libp2p TCP, Noise, and Yamux. No DHT/GossipSub/public bootstrap.
 * The handler is a *confidential* report receiver, not a public topic.
 */
export async function createPrivateNode({ listen = '/ip4/127.0.0.1/tcp/0' } = {}) {
  if (!/^\/ip4\/127\.0\.0\.1\/tcp\/(?:0|[1-9]\d{0,4})$/.test(listen))
    throw new Error('M04 demo only supports loopback IPv4 listeners');
  const [{createLibp2p},{tcp},{noise},{yamux}]=await Promise.all([
    import('libp2p'),import('@libp2p/tcp'),
    import('@chainsafe/libp2p-noise'),import('@chainsafe/libp2p-yamux'),
  ]);
  return createLibp2p({
    addresses:{listen:[listen]},transports:[tcp()],
    connectionEncrypters:[noise()],streamMuxers:[yamux()]
  });
}
function sendFrame(stream, object) {
  const frame=UTF8.encode(JSON.stringify(object)+'\n');
  if (frame.length > MAX_FRAME_BYTES) throw new Error('Oversized network frame');
  stream.send(frame);
}

/**
 * Receives one signed report per stream. Only replies with an ACK (and never
 * echoes private report content). The ingest verifier accepts allowlisted keys.
 */
export function registerPrivateIngest(node, ingest) {
  if (!ingest || typeof ingest.ingest !== 'function')
    throw new TypeError('Regional ingest interface requires ingest(envelope)');
  node.handle(PULSE_PROTOCOL, stream => {
    let received=false;
    const decoder=new JsonLineDecoder({
      maxLineBytes: MAX_FRAME_BYTES,
      onDropped:()=>{ stream.abort(new Error('Invalid or oversized frame')); },
      onLine:line=>{
        if(received) {stream.abort(new Error('Multiple frames on one stream'));return;}
        received=true;
        let outcome;
        try { outcome=ingest.ingest(JSON.parse(line)); }
        catch { outcome={accepted:false,ack:false,code:'invalid_payload'}; }
        const response={ schema:'pulsemesh.ack.v1', accepted:outcome.accepted,
          ack:outcome.ack, duplicate:outcome.duplicate===true,code:outcome.code,
          reportId:outcome.reportId??null };
        try {
          sendFrame(stream,response);
          // Finish sending the ACK. The requesting node closes its side.
          void stream.close().catch(()=>{});
        } catch {stream.abort(new Error('Failed to send acknowledgment'));}
      }
    });
    stream.addEventListener('message',evt=>{
      const bytes=evt.data.subarray();
      decoder.push(bytes);
    });
    stream.addEventListener('error',()=>{});
    stream.addEventListener('remoteCloseWrite',()=>{if(!received) void stream.close().catch(()=>{});});
  });
}

/**
 * Send an already signed, schema-restricted synthetic aggregate over an
 * encrypted libp2p stream. A transport ACK is not an independent data truth
 * or durable storage guarantee.
 */
export async function sendPrivateReport(node, peerId, envelope, {timeoutMs=5000}={}) {
  if (!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>60_000)
    throw new RangeError('Invalid timeout');
  // Reject malformed outbound reports before opening any network stream.
  const expectedReportId=verifyEnvelope(envelope).reportId;
  const stream=await node.dialProtocol(peerId,PULSE_PROTOCOL);
  return new Promise((resolve,reject)=>{
    let finished=false;
    const settle=(err,value)=>{
      if(finished)return;
      finished=true;
      clearTimeout(timer);
      void stream.close().catch(()=>{});
      if(err)reject(err);else resolve(value);
    };
    const timer=setTimeout(()=>settle(new Error('Ack timeout')),timeoutMs);
    const decoder=new JsonLineDecoder({
      maxLineBytes:MAX_FRAME_BYTES,
      onDropped:()=>settle(new Error('Invalid acknowledgment')),
      onLine:line=>{
        try {
          const response=JSON.parse(line);
          if(response.schema!=='pulsemesh.ack.v1' ||
            typeof response.ack!=='boolean' ||
            typeof response.accepted!=='boolean' ||
            typeof response.code!=='string' ||
            typeof response.duplicate!=='boolean' ||
            (response.reportId!==null&&typeof response.reportId!=='string'))
            throw new Error('Invalid acknowledgment schema');
          if(response.ack && (response.reportId!==expectedReportId ||
              !(response.accepted || response.duplicate)))
            throw new Error('Acknowledgment does not match the signed report');
          settle(null,response);
        }catch(e){settle(e);}
      }
    });
    stream.addEventListener('message',evt=>{
      if(!finished)decoder.push(evt.data.subarray());
    });
    stream.addEventListener('error',evt=>settle(evt.error??new Error('Stream error')));
    try {sendFrame(stream,envelope);}
    catch(e){settle(e);}
  });
}
