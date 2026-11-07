import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {openLocalIdentity} from '../src/identity.mjs';
import {signReport} from '../src/protocol.mjs';
import {DurableRegionalIngest} from '../src/durable-ingest.mjs';
import {createPrivateNode} from '../src/private-transport.mjs';
import {registerTrustedIndexerSync,fetchTrustedIndexerSummary}
 from '../src/indexer-sync.mjs';
import {createTrustedIndexerReconciler} from '../src/indexer-reconciler.mjs';

const NOW=Date.UTC(2026,10,6,20),AREA='synthetic-auto-test';
const fakeAddress='/ip4/127.0.0.1/tcp/1234/p2p/QmWmyoCVmCuVu7Aag84LUGD3rHL86utDXGZMSP1UDS4Jrc';
const policy={node:{},peerAddress:fakeAddress,
 allowedSourcePeerIds:new Set([fakeAddress.split('/').at(-1)]),area:AREA,
 intervalMs:100,maxReportsPerRound:2,pageSize:1};
const digest='a'.repeat(64);

test('bounded rounds checkpoint completed pages and detect agreement after final page',async()=>{
 const seen=[];
 const callbacks=[];
 const index={ingest(){},signedArchiveSummary:()=>({count:3,digest})};
 const sync=async({afterReportId,onPage})=>{
  seen.push(afterReportId);
  const next=String(seen.length).repeat(64);
  onPage({lastReportId:next});
  return {confirmed:2,accepted:1,duplicate:1,pages:1,
   lastReportId:next,hasMore:seen.length<3};
 };
 const reconciler=createTrustedIndexerReconciler({
  ...policy,index,synchronize:sync,
  fetchSummary:async()=>({count:3,digest})
 });
 assert.equal((await reconciler.runOnce()).status,'partial');
 assert.equal(reconciler.stats().hasPendingCursor,true);
 assert.equal((await reconciler.runOnce()).status,'partial');
 const final=await reconciler.runOnce();
 assert.equal(final.status,'consistent');
 assert.equal(reconciler.stats().lastAgreement,true);
 assert.equal(reconciler.stats().hasPendingCursor,false);
 assert.deepEqual(seen,['','1'.repeat(64),'2'.repeat(64)]);
 assert.equal(reconciler.stats().accepted,3);
 assert.equal(reconciler.stats().duplicates,3);
});

test('interrupted page retries from last committed checkpoint; no overlapping passes',async()=>{
 let release;
 let calls=0,active=0,maxActive=0;
 const begin=[];
 const index={ingest(){},signedArchiveSummary:()=>({count:1,digest})};
 const synchronizer=async({afterReportId,onPage})=>{
  calls++;active++;maxActive=Math.max(maxActive,active);
  begin.push(afterReportId);
  if(calls===1){
   onPage({lastReportId:'1'.repeat(64)});
   active--;throw Error('connection interrupted');
  }
  await new Promise(resolve=>{release=resolve});
  active--;
  return {confirmed:1,accepted:1,duplicate:0,pages:1,
   hasMore:false,lastReportId:'2'.repeat(64)};
 };
 const reconciler=createTrustedIndexerReconciler({
  ...policy,index,synchronize:synchronizer,
  fetchSummary:async()=>({count:1,digest})
 });
 const fail=await reconciler.runOnce();
 assert.equal(fail.status,'failed');
 assert.equal(reconciler.stats().hasPendingCursor,true);
 const pending=reconciler.runOnce();
 const shared=reconciler.runOnce();
 await sleep(20);
 assert.equal(calls,2);
 assert.equal(maxActive,1);
 release();
 const [a,b]=await Promise.all([pending,shared]);
 assert.equal(a.status,'consistent');
 assert.equal(b.status,'consistent');
 assert.deepEqual(begin,['','1'.repeat(64)]);
 assert.equal(reconciler.stats().failures,1);
 assert.equal(reconciler.stats().hasPendingCursor,false);
});

test('digest mismatch is surfaced and a complete pass resets cursor for future insertions',async()=>{
 const index={ingest(){},signedArchiveSummary:()=>({count:2,digest})};
 let fetches=0;
 const reconciler=createTrustedIndexerReconciler({
  ...policy,index,
  synchronize:async()=>({confirmed:0,accepted:0,duplicate:0,pages:1,
    hasMore:false,lastReportId:''}),
  fetchSummary:async()=>({count:++fetches,digest})
 });
 assert.equal((await reconciler.runOnce()).status,'divergent');
 assert.equal(reconciler.stats().lastAgreement,false);
 assert.equal((await reconciler.runOnce()).status,'consistent');
 assert.equal(reconciler.stats().agreements,1);
 assert.equal(reconciler.stats().disagreements,1);
});

test('invalid peer address, interval and untrusted PeerID fail before scheduling',()=>{
 const index={ingest(){},signedArchiveSummary:()=>({count:0,digest})};
 assert.throws(()=>createTrustedIndexerReconciler({...policy,index,intervalMs:0}),RangeError);
 assert.throws(()=>createTrustedIndexerReconciler({...policy,index,
  peerAddress:'/ip4/8.8.8.8/tcp/1234/p2p/trustedPeer'}),/Trusted source|private LAN/);
 assert.throws(()=>createTrustedIndexerReconciler({...policy,index,
  allowedSourcePeerIds:new Set(['someoneElse'])}),/Trusted source|private LAN/);
});

test('real signed-archive summary matches only identical accepted reports',async()=>{
 const root=mkdtempSync(path.join(tmpdir(),'palantiny-m09c-summaries-'));
 const stores=[],nodes=[];
 try{
  const key=openLocalIdentity(path.join(root,'key'));
  for(let i=0;i<2;i++)stores.push(new DurableRegionalIngest({
   dbPath:path.join(root,'store-'+i,'data.sqlite'),
   authorizedKeys:new Set([key.keyId]),now:()=>NOW
  }));
  const report=n=>({schema:'pulsemesh.activity.v1',area:AREA,
   bucketStart:NOW-(24-n)*60_000,bucketSeconds:60,
   activityIndex:25,metric:'ble_alias_activity'});
  for(let n=1;n<=2;n++){
   const env=signReport(report(n),key,n);
   assert.equal(stores[0].ingest(env).accepted,true);
   if(n===1)assert.equal(stores[1].ingest(env).accepted,true);
  }
  const [sourceNode,targetNode]=await Promise.all([createPrivateNode(),createPrivateNode()]);
  nodes.push(sourceNode,targetNode);
  const registration=registerTrustedIndexerSync(sourceNode,{
   index:stores[0],area:AREA,allowedPeers:new Set([targetNode.peerId.toString()])
  });
  try{
   const base=sourceNode.getMultiaddrs()[0].toString();
   const peerAddress=base.includes('/p2p/')?base:base+'/p2p/'+sourceNode.peerId.toString();
   const remote=await fetchTrustedIndexerSummary({
    node:targetNode,peerAddress,area:AREA,
    allowedSourcePeerIds:new Set([sourceNode.peerId.toString()])
   });
   assert.deepEqual(remote,stores[0].signedArchiveSummary({area:AREA}));
   assert.notDeepEqual(remote,stores[1].signedArchiveSummary({area:AREA}));
   assert.equal(remote.count,2);
   await assert.rejects(fetchTrustedIndexerSummary({
    node:targetNode,peerAddress,area:AREA,
    allowedSourcePeerIds:new Set(['untrusted'])}),/Untrusted/);
  }finally{await registration.close();}
 }finally{
  await Promise.allSettled(nodes.map(x=>x.stop()));
  for(const store of stores.reverse())store.close();
  rmSync(root,{recursive:true,force:true});
 }
});
