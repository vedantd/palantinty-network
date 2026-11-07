import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync,readFileSync,
 appendFileSync,existsSync,symlinkSync,chmodSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {openLocalIdentity} from '../src/identity.mjs';
import {signReport} from '../src/protocol.mjs';
import {DurableRegionalIngest} from '../src/durable-ingest.mjs';
import {backupSyntheticIndexer,restoreSyntheticIndexer}
 from '../src/private-indexer-backup.mjs';

const NOW=Date.UTC(2026,10,6,22),AREA='synthetic-backup-test';
const REPORT={schema:'pulsemesh.activity.v1',area:AREA,
 bucketStart:NOW-20*60_000,bucketSeconds:60,
 activityIndex:35,metric:'ble_alias_activity'};
async function fixture(run){
 const root=mkdtempSync(path.join(tmpdir(),'palantiny-i01-'));
 const signerA=openLocalIdentity(path.join(root,'signer-a'));
 const signerB=openLocalIdentity(path.join(root,'signer-b'));
 const authorizedKeys=new Set([signerA.keyId,signerB.keyId]);
 const sourcePath=path.join(root,'original','index.sqlite');
 const backupDir=path.join(root,'backups');
 const restoreDir=path.join(root,'recovered');
 mkdirSync(restoreDir,{mode:0o700});
 const options=dbPath=>({dbPath,authorizedKeys,now:()=>NOW,minOperators:2});
 const a=signReport(REPORT,signerA,1);
 const b=signReport({...REPORT,activityIndex:45},signerB,1);
 let db=new DurableRegionalIngest(options(sourcePath));
 try{
  assert.equal(db.ingest(a).accepted,true);
  assert.equal(db.ingest(b).accepted,true);
  const before=db.query({area:AREA});
  const summary=db.signedArchiveSummary({area:AREA});
  db.close();db=null; // Operator stops indexer before an offline backup.
  await run({root,sourcePath,backupDir,restoreDir,options,a,b,before,summary});
 }finally{
  try{db?.close();}catch{}
  rmSync(root,{recursive:true,force:true});
 }
}

test('private SQLite backup restores signed archive, replay watermark and aggregate history',async()=>{
 await fixture(async({sourcePath,backupDir,restoreDir,options,a,b,before,summary})=>{
  const backup=await backupSyntheticIndexer(sourcePath,backupDir);
  assert.equal(backup.userVersion,2);
  assert.equal(backup.acceptedReports,2);
  assert.equal(backup.signedEnvelopes,2);
  assert.equal(backup.contributors,2);
  const target=path.join(restoreDir,'index.sqlite');
  const restored=await restoreSyntheticIndexer(backupDir,target);
  assert.equal(restored.restored,true);
  const index=new DurableRegionalIngest(options(target));
  try{
   assert.deepEqual(index.query({area:AREA}),before);
   assert.deepEqual(index.signedArchiveSummary({area:AREA}),summary);
   assert.equal(index.stats().accepted,2);
   assert.equal(index.ingest(a).duplicate,true);
   assert.equal(index.ingest(b).duplicate,true);
  }finally{index.close();}
 });
});
test('tampered backup bytes and forged metadata fail before any target is created',async()=>{
 await fixture(async({sourcePath,backupDir,restoreDir})=>{
  await backupSyntheticIndexer(sourcePath,backupDir);
  const target=path.join(restoreDir,'index.sqlite');
  appendFileSync(path.join(backupDir,'index.sqlite'),'tamper');
  await assert.rejects(restoreSyntheticIndexer(backupDir,target),/checksum mismatch/);
  assert.equal(existsSync(target),false);
  // Build a fresh snapshot and corrupt the signed metadata instead.
  const second=path.join(path.dirname(backupDir),'backup-2');
  await backupSyntheticIndexer(sourcePath,second);
  const manifestPath=path.join(second,'manifest.json');
  const data=JSON.parse(readFileSync(manifestPath,'utf8'));
  data.acceptedReports=999;
  writeFileSync(manifestPath,JSON.stringify(data));
  await assert.rejects(restoreSyntheticIndexer(second,target),/metadata disagree/);
  assert.equal(existsSync(target),false);
 });
});
test('restore never overwrites an existing target, including a dangling symlink',async()=>{
 await fixture(async({sourcePath,backupDir,restoreDir})=>{
  await backupSyntheticIndexer(sourcePath,backupDir);
  const target=path.join(restoreDir,'index.sqlite');
  writeFileSync(target,'existing',{mode:0o600,flag:'wx'});
  await assert.rejects(restoreSyntheticIndexer(backupDir,target),/already exists/);
  assert.equal(readFileSync(target,'utf8'),'existing');
  rmSync(target);
  symlinkSync(path.join(restoreDir,'missing.sqlite'),target);
  await assert.rejects(restoreSyntheticIndexer(backupDir,target),/already exists/);
 });
});
test('existing backup directory and unsafe source permissions are rejected',async()=>{
 await fixture(async({sourcePath,backupDir,root})=>{
  mkdirSync(backupDir,{mode:0o700});
  writeFileSync(path.join(backupDir,'sentinel'),'untouched',{mode:0o600});
  await assert.rejects(backupSyntheticIndexer(sourcePath,backupDir),/EEXIST/);
  assert.equal(readFileSync(path.join(backupDir,'sentinel'),'utf8'),'untouched');
  chmodSync(sourcePath,0o644);
  await assert.rejects(backupSyntheticIndexer(sourcePath,path.join(root,'backup-2')),
   /0600/);
 });
});
test('invalid schema or mismatched signed archive is refused instead of backed up',async()=>{
 await fixture(async({sourcePath,backupDir})=>{
  const db=new DatabaseSync(sourcePath);
  db.exec("UPDATE signed_archive SET envelope='{}'");
  db.close();
  await assert.rejects(backupSyntheticIndexer(sourcePath,backupDir));
  assert.equal(existsSync(backupDir),false);
  const db2=new DatabaseSync(sourcePath);
  db2.exec('PRAGMA user_version=99');
  db2.close();
  await assert.rejects(backupSyntheticIndexer(sourcePath,backupDir),
   /schema v2/);
  assert.equal(existsSync(backupDir),false);
 });
});
