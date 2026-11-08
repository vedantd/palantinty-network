import {CID} from 'multiformats/cid';
import {create as createMultihashDigest} from 'multiformats/hashes/digest';
import {peerIdFromPrivateKey} from '@libp2p/peer-id';
import {JsonLineDecoder} from './jsonl.mjs';
import {parseSyntheticRegionKey,syntheticRegionRoutingDigest}
 from './private-synthetic-region.mjs';
import {signPeerBoundCoverage,verifyPeerBoundCoverage}
 from './private-peer-bound-coverage.mjs';

export const PRIVATE_REGION_COVERAGE_PROTOCOL='/palantiny-network/private-region-coverage/0.1.0';
const REQUEST='palantiny.private-region-coverage.request.v1';
const RESPONSE='palantiny.private-region-coverage.response.v1';
const MAX_FRAME=8192;
const MAX_CANDIDATES=16;
const UTF8=new TextEncoder();
const own=(o,fields)=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&
 Object.keys(o).length===fields.length&&fields.every(k=>Object.hasOwn(o,k));
const isLoopback=addr=>typeof addr==='string'&&
 /^\/ip4\/127\.0\.0\.1\/tcp\/[0-9]+(?:\/p2p\/[a-zA-Z0-9]+)?$/.test(addr);
const stripPeerSuffix=addr=>addr.replace(/\/p2p\/[a-zA-Z0-9]+$/,'');
/**
 * An untrusted DHT address can never substitute for the remote endpoint of
 * a live Noise-authenticated libp2p connection.
 */
export function currentVerifiedProviderEndpoint(node,provider){
 const id=provider?.id?.toString();
 const advertised=provider?.multiaddrs?.map(a=>a.toString())??[];
 if(!id||advertised.length<1||advertised.length>8||
    advertised.some(a=>!isLoopback(a)))
  throw Error('D02b unsafe or missing private provider addresses');
 const connections=node.getConnections?.(provider.id)??[];
 const endpoints=connections.filter(c=>c.remotePeer?.toString()===id)
  .map(c=>c.remoteAddr?.toString()).filter(Boolean);
 if(endpoints.some(a=>!isLoopback(a)))
  throw Error('D02b refuses non-loopback authenticated connection');
 const live=endpoints.find(a=>advertised.some(b=>stripPeerSuffix(a)===stripPeerSuffix(b)));
 if(!live)throw Error('D02b stale provider address; fresh signed discovery required');
 return stripPeerSuffix(live);
}
const frame=x=>{
 const bytes=UTF8.encode(JSON.stringify(x)+'\n');
 if(bytes.byteLength>MAX_FRAME)throw Error('Private region frame exceeds size limit');
 return bytes;
};
function assertPrivateNode(node){
 if(!node?.services?.dht||!node?.contentRouting||
    typeof node.contentRouting.provide!=='function'||
    typeof node.contentRouting.findProviders!=='function')
  throw Error('Explicit private Kademlia-enabled node required');
 const addresses=node.getMultiaddrs()?.map(a=>a.toString());
 if(!addresses?.length||addresses.some(a=>!isLoopback(a)))
  throw Error('Private regional discovery is limited to 127.0.0.1');
}
const ttlValid=n=>Number.isSafeInteger(n)&&n>=250&&n<=60_000;

/**
 * Content-routing CID is a stable *name* for an imaginary regional topic,
 * not a report block, truthful geographic claim, or a public IPFS CID.
 */
export function syntheticRegionProviderCid(region){
 parseSyntheticRegionKey(region);
 const digest=createMultihashDigest(0x12,syntheticRegionRoutingDigest(region));
 return CID.createV1(0x55,digest);
}

/**
 * Serve an authenticated, bounded, signed coverage claim over a direct
 * encrypted libp2p stream. Only already-approved private clients may read it.
 */
export function registerPrivateRegionCoverage(node,{
 privateKey,regions,approvedClientPeerIds,clock=()=>Date.now()
}={}){
 assertPrivateNode(node);
 if(privateKey?.type!=='Ed25519'||!Array.isArray(regions)||
    regions.length===0||regions.length>16||
    regions.some(r=>{try{parseSyntheticRegionKey(r);return false;}catch{return true;}})||
    regions.join('|')!==[...new Set(regions)].sort().join('|')||
    !(approvedClientPeerIds instanceof Set)||approvedClientPeerIds.size===0||
    typeof clock!=='function')
  throw Error('Explicit private identity, sorted fictional coverage and reviewed clients required');
 const peerId=peerIdFromPrivateKey(privateKey).toString();
 if(node.peerId.toString()!==peerId)
  throw Error('Coverage signer must be the actual libp2p node identity');
 const counters={authorized:0,denied:0,served:0,invalid:0};
 const handler=(stream,connection)=>{
  const remote=connection?.remotePeer?.toString();
  const addr=connection?.remoteAddr?.toString()??'';
  if(!remote||!approvedClientPeerIds.has(remote)||!isLoopback(addr)){
   counters.denied++;stream.abort(new Error('Unauthorized private coverage client'));return;
  }
  counters.authorized++;
  let handled=false;
  const decoder=new JsonLineDecoder({
   maxLineBytes:MAX_FRAME,
   onDropped:()=>{counters.invalid++;stream.abort(new Error('Oversized private coverage request'));},
   onLine:line=>{
    if(handled){counters.invalid++;stream.abort(new Error('Duplicate private coverage request'));return;}
    handled=true;
    void (async()=>{
     try{
      const request=JSON.parse(line);
      if(!own(request,['schema','region'])||request.schema!==REQUEST||
         !regions.includes(request.region))
       throw Error('Unserved or malformed region');
      parseSyntheticRegionKey(request.region);
      const now=clock();
      const advert=await signPeerBoundCoverage({
       version:1,peerId,regions:[...regions],
       issuedAt:now,expiresAt:now+60_000
      },privateKey,now);
      stream.send(frame({schema:RESPONSE,region:request.region,advert}));
      counters.served++;
      await stream.close();
     }catch{
      counters.invalid++;
      stream.abort(new Error('Private coverage refused request'));
     }
    })();
   }
  });
  stream.addEventListener('message',event=>decoder.push(event.data.subarray()));
  stream.addEventListener('error',()=>{});
  stream.addEventListener('remoteCloseWrite',()=>{
   if(!handled)void stream.close().catch(()=>{});
  });
 };
 node.handle(PRIVATE_REGION_COVERAGE_PROTOCOL,handler,{
  maxInboundStreams:2,maxOutboundStreams:2
 });
 return Object.freeze({
  stats:()=>Object.freeze({...counters}),
  close:()=>node.unhandle(PRIVATE_REGION_COVERAGE_PROTOCOL)
 });
}

/** Announce only a fictional region CID using Kademlia content routing. */
export async function announcePrivateRegion(node,region,{timeoutMs=8000}={}){
 assertPrivateNode(node);
 if(!ttlValid(timeoutMs))throw Error('Invalid private DHT announcement timeout');
 const cid=syntheticRegionProviderCid(region);
 await node.contentRouting.provide(cid,{signal:AbortSignal.timeout(timeoutMs)});
 return Object.freeze({region,cid:cid.toString(),announced:true});
}

async function fetchCoverage(node,provider,{region,approvedIndexerPeerIds,timeoutMs,clock}){
 const peerId=provider?.id?.toString();
 if(!peerId||!approvedIndexerPeerIds.has(peerId))
  throw Error('Unapproved DHT provider Peer ID');
 const addrs=provider.multiaddrs??[];
 if(!addrs.length||addrs.some(a=>!isLoopback(a.toString())))
  throw Error('DHT supplied a missing or non-loopback indexer address');
 await node.peerStore.patch(provider.id,{multiaddrs:addrs});
 const stream=await node.dialProtocol(provider.id,PRIVATE_REGION_COVERAGE_PROTOCOL,{
  signal:AbortSignal.timeout(timeoutMs)
 });
 let authenticatedAddress;
 try{authenticatedAddress=currentVerifiedProviderEndpoint(node,provider);}
 catch(error){
  await stream.abort(error);
  throw error;
 }
 return new Promise((resolve,reject)=>{
  let done=false;
  const settle=(error,result)=>{
   if(done)return;
   done=true;clearTimeout(timer);
   void stream.close().catch(()=>{});
   if(error)reject(error);else resolve(result);
  };
  const timer=setTimeout(()=>settle(new Error('Private coverage request timeout')),timeoutMs);
  const decoder=new JsonLineDecoder({
   maxLineBytes:MAX_FRAME,
   onDropped:()=>settle(new Error('Oversized private coverage response')),
   onLine:line=>{
    void (async()=>{
     try{
      const response=JSON.parse(line);
      if(!own(response,['schema','region','advert'])||
         response.schema!==RESPONSE||response.region!==region)
       throw Error('Invalid private coverage response');
      const valid=await verifyPeerBoundCoverage(response.advert,{
       expectedPeerId:peerId,approvedPeerIds:approvedIndexerPeerIds,
       region,now:clock()
      });
      if(!valid)throw Error('Indexer coverage is not cryptographically authorized');
      settle(null,Object.freeze({peerId,region,
       advertisedRegions:[...response.advert.payload.regions],
       issuedAt:response.advert.payload.issuedAt,
       expiresAt:response.advert.payload.expiresAt,
       authenticatedAddress,
       verified:true,privateTransport:true}));
     }catch(error){settle(error);}
    })();
   }
  });
  stream.addEventListener('message',event=>{
   if(!done)decoder.push(event.data.subarray());
  });
  stream.addEventListener('error',event=>
   settle(event.error??new Error('Private coverage stream error')));
  try{stream.send(frame({schema:REQUEST,region}));}
  catch(error){settle(error);}
 });
}

/**
 * Discover by *region*, not known Peer ID. The client knows one bootstrap
 * router plus an independently approved set of indexer Peer IDs; it has
 * no shared region-to-indexer directory and never trusts DHT coverage data.
 */
export async function discoverPrivateRegionIndexers(node,{
 region,approvedIndexerPeerIds,minIndexers=2,maxCandidates=MAX_CANDIDATES,
 timeoutMs=15_000,clock=()=>Date.now()
}={}){
 assertPrivateNode(node);
 const cid=syntheticRegionProviderCid(region);
 if(!(approvedIndexerPeerIds instanceof Set)||
    approvedIndexerPeerIds.size<minIndexers||
    !Number.isSafeInteger(minIndexers)||minIndexers<1||minIndexers>4||
    !Number.isSafeInteger(maxCandidates)||maxCandidates<minIndexers||
    maxCandidates>MAX_CANDIDATES||!ttlValid(timeoutMs)||
    typeof clock!=='function')
  throw Error('Bounded approved indexer selection and timeout required');
 const found=[],rejected=[],seen=new Set();
 const signal=AbortSignal.timeout(timeoutMs);
 try{
  for await(const provider of node.contentRouting.findProviders(cid,{signal})){
   const id=provider?.id?.toString();
   if(!id||seen.has(id))continue;
   seen.add(id);
   if(!approvedIndexerPeerIds.has(id)){
    rejected.push({peerId:id,reason:'not-approved'});
   }else{
    try{
     found.push(await fetchCoverage(node,provider,{
      region,approvedIndexerPeerIds,timeoutMs:Math.min(timeoutMs,5000),clock
     }));
    }catch(error){
     rejected.push({peerId:id,reason:String(error?.message??error)});
    }
   }
   if(found.length>=minIndexers||seen.size>=maxCandidates)break;
  }
 }catch(error){
  if(found.length<minIndexers)
   throw Error('Private DHT regional lookup failed: '+String(error?.message??error));
 }
 if(found.length<minIndexers)
  throw Error('Only '+found.length+'/'+minIndexers+
   ' approved indexers discovered for private region '+region);
 return Object.freeze({schema:'palantiny.private-region-discovery.v1',
  region,cid:cid.toString(),results:found,rejected,
  verifiedCount:found.length,usesCentralRegionRegistry:false,
  sandboxOnly:true,realSensing:false});
}
