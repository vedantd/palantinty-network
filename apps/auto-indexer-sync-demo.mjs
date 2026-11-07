#!/usr/bin/env node
/**
 * M09c: one trusted independent indexer automatically catches up after
 * a failed connection, using small bounded rounds and archive consistency
 * fingerprints. All data synthetic, all network sockets on loopback.
 */
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {openLocalIdentity} from '../src/identity.mjs';
import {signReport} from '../src/protocol.mjs';
import {DurableRegionalIngest} from '../src/durable-ingest.mjs';
import {createPrivateNode} from '../src/private-transport.mjs';
import {registerTrustedIndexerSync} from '../src/indexer-sync.mjs';
import {createTrustedIndexerReconciler} from '../src/indexer-reconciler.mjs';

const root=mkdtempSync(path.join(tmpdir(),'palantiny-m09c-'));
const nodes=[],indexes=[];
const now=Date.UTC(2026,10,6,20),area='synthetic-automatic-sync';
const until=async(check,label)=>{
 const end=Date.now()+14_000;
 while(Date.now()<end){if(check())return;await sleep(75);}
 throw new Error('Timed out waiting for '+label);
};
let registered,reconciler;
try{
 const signers=[0,1].map(i=>openLocalIdentity(path.join(root,'signer-'+i)));
 const authorizedKeys=new Set(signers.map(x=>x.keyId));
 for(let i=0;i<2;i++)indexes.push(new DurableRegionalIngest({
   dbPath:path.join(root,'indexer-'+i,'db.sqlite'),
   authorizedKeys,now:()=>now,minOperators:2
 }));
 const [source,target]=indexes;
 for(let sequence=1;sequence<=5;sequence++)for(const [i,key] of signers.entries()){
   const env=signReport({
     schema:'pulsemesh.activity.v1',area,
     bucketStart:now-(25-sequence)*60_000,
     bucketSeconds:60,activityIndex:i?35:25,metric:'ble_alias_activity'
   },key,sequence);
   if(!source.ingest(env).accepted)throw Error('Source setup failed');
   if(sequence===1||sequence===5){
     if(!target.ingest(env).accepted)throw Error('Target setup failed');
   }
 }
 const [sourceNode,targetNode]=await Promise.all([createPrivateNode(),createPrivateNode()]);
 nodes.push(sourceNode,targetNode);
 const base=sourceNode.getMultiaddrs()[0].toString();
 const sourceAddress=base.includes('/p2p/')?base:base+'/p2p/'+sourceNode.peerId.toString();
 const options={
   node:targetNode,index:target,peerAddress:sourceAddress,area,
   allowedSourcePeerIds:new Set([sourceNode.peerId.toString()]),
   pageSize:2,maxReportsPerRound:3,intervalMs:120,timeoutMs:500
 };
 reconciler=createTrustedIndexerReconciler(options);
 // The first attempt fails with the sync handler unavailable.
 const offline=await reconciler.runOnce();
 if(offline.status!=='failed'||target.stats().accepted!==4)
   throw Error('Expected unavailable-source failure');
 registered=registerTrustedIndexerSync(sourceNode,{
   index:source,area,allowedPeers:new Set([targetNode.peerId.toString()])
 });
 reconciler.start();
 await until(()=>reconciler.stats().agreements>=1,'automated source/target agreement');
 const final=reconciler.stats();
 if(target.stats().accepted!==10||source.stats().accepted!==10||
    final.accepted!==6||final.failures<1||
    source.signedArchiveSummary({area}).digest!==target.signedArchiveSummary({area}).digest)
   throw Error('Automatic reconciliation inconsistent');
 reconciler.stop();
 console.log(JSON.stringify({
   simulation:true,loopbackOnly:true,
   sourceReports:source.stats().accepted,targetReports:target.stats().accepted,
   automaticReconciliation:true,recoveredAfterUnavailablePeer:true,
   recoveredReports:final.accepted,retriesAfterFailure:final.failures,
   sourceTargetArchiveAgreement:final.lastAgreement,
   cycles:final.rounds,pages:final.pages,
   archivedLegacyRowsIncluded:false,
   note:'Explicit trusted localhost peer; no public scheduling or actual sensor observations.'
 },null,2));
}finally{
 reconciler?.stop();
 try{await registered?.close()}catch{}
 await Promise.allSettled(nodes.map(node=>node.stop()));
 for(const index of indexes.reverse())try{index.close()}catch{}
 rmSync(root,{recursive:true,force:true});
}
