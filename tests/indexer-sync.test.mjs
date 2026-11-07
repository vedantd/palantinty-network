import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openLocalIdentity} from '../src/identity.mjs';
import {signReport} from '../src/protocol.mjs';
import {DurableRegionalIngest} from '../src/durable-ingest.mjs';
import {createPrivateNode} from '../src/private-transport.mjs';
import {registerTrustedIndexerSync,synchronizeTrustedIndexer}
 from '../src/indexer-sync.mjs';

const NOW=Date.UTC(2026,10,6,20),AREA='synthetic-indexer-tests';
const report=(seq,value=25)=>({schema:'pulsemesh.activity.v1',area:AREA,
 bucketStart:NOW-(25-seq)*60_000,bucketSeconds:60,
 activityIndex:value,metric:'ble_alias_activity'});
async function fixture(fn){
 const dir=mkdtempSync(path.join(tmpdir(),'palantiny-indexer-sync-test-'));
 const nodes=[],stores=[];
 try{
  const key=openLocalIdentity(path.join(dir,'signer'));
  const start=(name)=>{const x=new DurableRegionalIngest({
   dbPath:path.join(dir,name,'index.sqlite'),
   authorizedKeys:new Set([key.keyId]),now:()=>NOW,minOperators:2
  });stores.push(x);return x;};
  const peer=async()=>{const n=await createPrivateNode();nodes.push(n);return n;};
  return await fn({dir,key,start,peer});
 }finally{
  for(const x of stores.reverse())try{x.close()}catch{}
  await Promise.allSettled(nodes.map(x=>x.stop()));
  rmSync(dir,{recursive:true,force:true});
 }
}
const address=node=>{const base=node.getMultiaddrs()[0].toString();
 return base.includes('/p2p/')?base:base+'/p2p/'+node.peerId.toString();};

test('signed archive is committed atomically with report and watermark',()=>fixture(({key,start})=>{
 const source=start('source');
 source.db.exec(`CREATE TRIGGER deny_archive BEFORE INSERT ON signed_archive
 BEGIN SELECT RAISE(ABORT,'archive failure'); END;`);
 assert.throws(()=>source.ingest(signReport(report(1),key,1)),/archive failure/);
 assert.equal(source.stats().accepted,0);
 assert.equal(source.stats().contributors,0);
 assert.equal(source.db.prepare('SELECT count(*) AS n FROM signed_archive').get().n,0);
 source.db.exec('DROP TRIGGER deny_archive');
 assert.equal(source.ingest(signReport(report(1),key,1)).accepted,true);
 assert.equal(source.signedArchivePage({area:AREA}).envelopes.length,1);
}));

test('signed archive pages are bounded, deterministic and validate malformed cursors',()=>fixture(({key,start})=>{
 const source=start('source');
 for(let i=1;i<=5;i++)assert.equal(source.ingest(signReport(report(i),key,i)).accepted,true);
 const p1=source.signedArchivePage({area:AREA,limit:2});
 const p2=source.signedArchivePage({area:AREA,after:p1.next,limit:2});
 const p3=source.signedArchivePage({area:AREA,after:p2.next,limit:2});
 assert.deepEqual([p1.envelopes.length,p2.envelopes.length,p3.envelopes.length],[2,2,1]);
 assert.deepEqual([p1.hasMore,p2.hasMore,p3.hasMore],[true,true,false]);
 const ids=[...p1.envelopes,...p2.envelopes,...p3.envelopes].map(x=>x.body.reportId);
 assert.equal(new Set(ids).size,5);
 assert.deepEqual(ids,[...ids].sort());
 assert.throws(()=>source.signedArchivePage({area:AREA,limit:11}));
 assert.throws(()=>source.signedArchivePage({area:AREA,after:'not-an-id'}));
 assert.deepEqual(source.signedArchivePage({area:'other-area'}).envelopes,[]);
}));

test('v1 regional database migrates to v2 without fabricating signatures for old reports',()=>fixture(({key,dir,start})=>{
 let old=start('legacy');
 const original=signReport(report(1),key,1);
 assert.equal(old.ingest(original).accepted,true);
 old.close();
 // A v1 fixture is a complete old accepted_reports/high-water schema
 // without a signed archive. It cannot reconstruct the original signature.
 const dbPath=path.join(dir,'legacy','index.sqlite');
 const db=new DatabaseSync(dbPath);
 db.exec('DROP TABLE signed_archive; PRAGMA user_version=1;');
 db.close();
 const upgraded=new DurableRegionalIngest({
   dbPath,authorizedKeys:new Set([key.keyId]),now:()=>NOW
 });
 assert.equal(upgraded.db.prepare('PRAGMA user_version').get().user_version,2);
 assert.equal(upgraded.stats().accepted,1);
 assert.equal(upgraded.signedArchivePage({area:AREA}).envelopes.length,0);
 assert.equal(upgraded.ingest(original).duplicate,true);
 assert.equal(upgraded.ingest(signReport(report(2),key,2)).accepted,true);
 assert.equal(upgraded.signedArchivePage({area:AREA}).envelopes.length,1);
 upgraded.close();
}));

test('untrusted indexer peer is rejected before any archive query',async()=>fixture(async({key,start,peer})=>{
 const source=start('source');
 assert.equal(source.ingest(signReport(report(1),key,1)).accepted,true);
 const server=await peer(),trusted=await peer(),unknown=await peer();
 const sync=registerTrustedIndexerSync(server,{index:source,area:AREA,
   allowedPeers:new Set([trusted.peerId.toString()])});
 try{
  await assert.rejects(()=>synchronizeTrustedIndexer({
   node:unknown,index:start('unknown'),peerAddress:address(server),area:AREA,
   allowedSourcePeerIds:new Set([server.peerId.toString()]),
   timeoutMs:500
  }));
  assert.ok(sync.stats().denied>=1);
  await assert.rejects(()=>synchronizeTrustedIndexer({
   node:trusted,index:start('other'),peerAddress:address(server),area:AREA,
   allowedSourcePeerIds:new Set(['untrusted-peer'])
  }),/Untrusted source/);
 }finally{await sync.close();}
}));

test('trusted source alone can repair missing signed history without contributor process',async()=>fixture(async({key,start,peer})=>{
 const source=start('source'),target=start('target');
 for(let seq=1;seq<=4;seq++){
  const envelope=signReport(report(seq),key,seq);
  assert.equal(source.ingest(envelope).accepted,true);
  if(seq!==2)assert.equal(target.ingest(envelope).accepted,true);
 }
 const sourceNode=await peer(),targetNode=await peer();
 const registered=registerTrustedIndexerSync(sourceNode,{index:source,area:AREA,
   allowedPeers:new Set([targetNode.peerId.toString()])});
 try{
  const options={node:targetNode,index:target,
   peerAddress:address(sourceNode),allowedSourcePeerIds:new Set([sourceNode.peerId.toString()]),
   area:AREA,pageSize:1,maxReports:8};
  const first=await synchronizeTrustedIndexer(options);
  assert.equal(first.accepted,1);
  assert.equal(first.duplicate,3);
  assert.equal(first.hasMore,false);
  assert.equal(target.stats().accepted,4);
  assert.equal(registered.stats().served,4);
  const again=await synchronizeTrustedIndexer(options);
  assert.equal(again.accepted,0);
  assert.equal(again.duplicate,4);
 }finally{await registered.close();}
}));
