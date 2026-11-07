#!/usr/bin/env node
/**
 * M09b: two independent durable regional indexers exchange signed history
 * over mutually explicitly allowed encrypted libp2p connections.
 * The original contributors never run as network peers.
 */
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {openLocalIdentity} from '../src/identity.mjs';
import {signReport} from '../src/protocol.mjs';
import {DurableRegionalIngest} from '../src/durable-ingest.mjs';
import {createPrivateNode} from '../src/private-transport.mjs';
import {registerTrustedIndexerSync,synchronizeTrustedIndexer}
 from '../src/indexer-sync.mjs';

const dir=mkdtempSync(path.join(tmpdir(),'palantiny-m09b-'));
const nodes=[],close=[];
const now=Date.UTC(2026,10,6,20),area='synthetic-indexer-sync';
try{
 const identities=[0,1].map(i=>openLocalIdentity(path.join(dir,'signer-'+i)));
 const allowed=new Set(identities.map(key=>key.keyId));
 const [sourcePeer,targetPeer]=await Promise.all([createPrivateNode(),createPrivateNode()]);
 nodes.push(sourcePeer,targetPeer);
 const [source,target]=[0,1].map(i=>new DurableRegionalIngest({
   dbPath:path.join(dir,'indexer-'+i,'regional.sqlite'),
   authorizedKeys:allowed,now:()=>now,minOperators:2
 }));
 close.push(()=>source.close(),()=>target.close());
 // Contributors are only fixture signing keys; no source contributor
 // processes, public links, or special server authority are required.
 const envelopes=[];
 for(let sequence=1;sequence<=3;sequence++)for(let signer=0;signer<2;signer++){
   const report={schema:'pulsemesh.activity.v1',area,
     bucketStart:now-(25-sequence)*60_000,bucketSeconds:60,
     activityIndex:signer===0?25:35,metric:'ble_alias_activity'};
   envelopes.push(signReport(report,identities[signer],sequence));
 }
 for(let i=0;i<envelopes.length;i++){
   if(source.ingest(envelopes[i]).accepted!==true)throw Error('Source ingest failed');
   // Target misses the middle time bucket (sequence=2).
   if(envelopes[i].body.sequence!==2 &&
      target.ingest(envelopes[i]).accepted!==true)throw Error('Target setup failed');
 }
 if(source.stats().accepted!==6||target.stats().accepted!==4)
   throw Error('Unexpected pre-sync divergence');
 const registered=registerTrustedIndexerSync(sourcePeer,{
   index:source,area,allowedPeers:new Set([targetPeer.peerId.toString()])
 });
 close.push(()=>registered.close());
 const address=sourcePeer.getMultiaddrs()[0].toString();
 const sourceAddress=address.includes('/p2p/')?address:
   address+'/p2p/'+sourcePeer.peerId.toString();
 const options={node:targetPeer,index:target,peerAddress:sourceAddress,area,
   allowedSourcePeerIds:new Set([sourcePeer.peerId.toString()]),pageSize:2};
 const first=await synchronizeTrustedIndexer(options);
 if(target.stats().accepted!==6||first.accepted!==2||first.duplicate!==4||
    first.pages<3||first.hasMore)throw Error('Indexer anti-entropy failed');
 const second=await synchronizeTrustedIndexer(options);
 if(second.accepted!==0||second.duplicate!==6)throw Error('Idempotent re-sync failed');
 const sourceSeries=source.query({area}),targetSeries=target.query({area});
 if(JSON.stringify(sourceSeries)!==JSON.stringify(targetSeries)||
    sourceSeries.length!==3)throw Error('Aggregate series diverged after reconciliation');
 console.log(JSON.stringify({
   simulation:true,loopbackOnly:true,realSensorData:false,
   transport:'noise-encrypted-indexer-to-indexer-sync',
   contributorPeersRequired:false,
   sourceReports:source.stats().accepted,targetReports:target.stats().accepted,
   recoveredReports:first.accepted,previouslyKnown:first.duplicate,
   pages:first.pages,secondPassDuplicates:second.duplicate,
   independentRegionalSeriesConverged:true,
   publicArchive:false,automaticScheduling:false,
   note:'Explicitly authorized localhost sync; real sensor data and public access remain disabled.'
 },null,2));
}finally{
 for(const stop of close.reverse())try{await stop()}catch{}
 await Promise.allSettled(nodes.map(node=>node.stop()));
 rmSync(dir,{recursive:true,force:true});
}
