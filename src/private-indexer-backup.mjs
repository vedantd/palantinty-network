import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {createReadStream,copyFileSync,constants,existsSync,lstatSync,
 mkdirSync,openSync,closeSync,fsyncSync,writeFileSync,renameSync,
 linkSync,unlinkSync,rmSync,chmodSync,readFileSync} from 'node:fs';
import {DatabaseSync,backup as sqliteBackup} from 'node:sqlite';
import {verifyEnvelope} from './protocol.mjs';

const SCHEMA='palantiny.private-synthetic-indexer-backup.v1';
const SQLITE='index.sqlite',MANIFEST='manifest.json';
const MAX_BYTES=1024*1024*1024; // Offline pilot: 1 GiB maximum.
const exact=(x,fields)=>!!x&&typeof x==='object'&&!Array.isArray(x)&&
 Object.keys(x).length===fields.length&&fields.every(k=>Object.hasOwn(x,k));
function requireAbsolute(p){
 if(typeof p!=='string'||!path.isAbsolute(p)||p==='/'||p.includes('\0'))
  throw Error('Absolute non-root operator path required');
 return path.resolve(p);
}
function assertDirectory(directory){
 const s=lstatSync(directory);
 if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077)!==0)
  throw Error('Private 0700 directory required');
}
function assertFile(file){
 const s=lstatSync(file);
 if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o077)!==0||
    s.size===0||s.size>MAX_BYTES)
  throw Error('Private bounded 0600 regular file required');
 return s.size;
}
function syncFile(file){
 const fd=openSync(file,'r');
 try{fsyncSync(fd);}finally{closeSync(fd);}
}
function syncDir(dir){
 const fd=openSync(dir,'r');
 try{fsyncSync(fd);}finally{closeSync(fd);}
}
async function digestFile(file){
 const h=createHash('sha256');
 for await(const chunk of createReadStream(file))h.update(chunk);
 return h.digest('hex');
}
function readVerifiedDatabase(file){
 assertDirectory(path.dirname(file));
 assertFile(file);
 const db=new DatabaseSync(file,{readOnly:true});
 try{
  if(db.prepare('PRAGMA integrity_check').get()?.integrity_check!=='ok')
   throw Error('SQLite backup integrity check failed');
  if(db.prepare('PRAGMA user_version').get()?.user_version!==2)
   throw Error('Only synthetic regional indexer SQLite schema v2 supported');
  for(const table of ['contributor_sequences','accepted_reports','signed_archive']){
   if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))
    throw Error('Missing required indexer table: '+table);
  }
  if(db.prepare('PRAGMA foreign_key_check').all().length)
   throw Error('Broken archive foreign key');
  const getCount=name=>db.prepare('SELECT count(*) AS n FROM '+name).get().n;
  const acceptedReports=getCount('accepted_reports');
  const signedEnvelopes=getCount('signed_archive');
  const contributors=getCount('contributor_sequences');
  if(acceptedReports<signedEnvelopes||acceptedReports>100_000||
     signedEnvelopes>100_000||contributors>10_000)
   throw Error('Unexpected indexer archive cardinality');
  // Verify the signed, private envelopes against the accepted metadata.
  const rows=db.prepare(`SELECT a.report_id,a.key_id,a.sequence,a.area,
    a.bucket_start,a.bucket_seconds,a.activity_index,s.envelope
    FROM signed_archive s JOIN accepted_reports a ON a.report_id=s.report_id`).iterate();
  let checked=0;
  for(const row of rows){
   const body=verifyEnvelope(JSON.parse(row.envelope));
   const v=body.report;
   if(body.reportId!==row.report_id||body.keyId!==row.key_id||
      body.sequence!==row.sequence||v.area!==row.area||
      v.bucketStart!==row.bucket_start||v.bucketSeconds!==row.bucket_seconds||
      v.activityIndex!==row.activity_index)
    throw Error('Signed indexer archive does not match stored report');
   checked++;
  }
  if(checked!==signedEnvelopes)throw Error('Signed archive join mismatch');
  const highs=db.prepare(`SELECT a.key_id,MAX(a.sequence) AS max_seq,
     s.highest_sequence AS high FROM accepted_reports a
     LEFT JOIN contributor_sequences s ON s.key_id=a.key_id
     GROUP BY a.key_id`).all();
  if(highs.some(r=>!Number.isSafeInteger(r.high)||r.high<r.max_seq))
   throw Error('Indexer replay watermark mismatch');
  return Object.freeze({acceptedReports,signedEnvelopes,contributors,userVersion:2});
 }finally{db.close();}
}
function validatedManifest(data){
 if(!exact(data,['schema','createdAt','sqliteSha256','bytes','userVersion',
  'acceptedReports','signedEnvelopes','contributors'])||
  data.schema!==SCHEMA||
  typeof data.createdAt!=='string'||!/^20\d{2}-\d\d-\d\dT/.test(data.createdAt)||
  !/^[a-f0-9]{64}$/.test(data.sqliteSha256)||
  !Number.isSafeInteger(data.bytes)||data.bytes<100||data.bytes>MAX_BYTES||
  data.userVersion!==2||
  ![data.acceptedReports,data.signedEnvelopes,data.contributors]
   .every(n=>Number.isSafeInteger(n)&&n>=0))
  throw Error('Invalid private backup manifest');
 return data;
}
function equalSnapshot(manifest,meta){
 for(const key of ['userVersion','acceptedReports','signedEnvelopes','contributors']){
  if(manifest[key]!==meta[key])throw Error('Backup manifest and SQLite metadata disagree');
 }
}
/**
 * Create a new private backup directory. Never overwrite an existing backup.
 * Node 22.16+ sqlite.backup() produces a transactionally consistent snapshot.
 */
export async function backupSyntheticIndexer(sourcePath,backupDirectory){
 const source=requireAbsolute(sourcePath),directory=requireAbsolute(backupDirectory);
 assertDirectory(path.dirname(source));
 assertFile(source);
 assertDirectory(path.dirname(directory));
 if(typeof sqliteBackup!=='function')
  throw Error('Node.js 22.16+ sqlite.backup required');
 // Destination directory must not exist; exclusive mkdir prevents clobber.
 mkdirSync(directory,{mode:0o700});
 try{
  assertDirectory(directory);
  const snapshot=path.join(directory,SQLITE);
  const db=new DatabaseSync(source,{readOnly:true});
  try{
   // Check the original before snapshot. Validate the snapshot separately,
   // since another writer may commit after this initial inspection.
   readVerifiedDatabase(source);
   await sqliteBackup(db,snapshot);
  }finally{db.close();}
  chmodSync(snapshot,0o600);
  assertFile(snapshot);
  syncFile(snapshot);
  const meta=readVerifiedDatabase(snapshot);
  const manifest=validatedManifest({
   schema:SCHEMA,createdAt:new Date().toISOString(),
   sqliteSha256:await digestFile(snapshot),bytes:assertFile(snapshot),...meta
  });
  const name=path.join(directory,MANIFEST);
  const fd=openSync(name,'wx',0o600);
  try{writeFileSync(fd,JSON.stringify(manifest,null,2)+'\n');fsyncSync(fd);}
  finally{closeSync(fd);}
  syncDir(directory);
  syncDir(path.dirname(directory));
  return Object.freeze({...manifest,backupDirectory:directory});
 }catch(error){
  // No valid manifest should survive a failed snapshot attempt.
  rmSync(directory,{recursive:true,force:true});
  throw error;
 }
}
/**
 * Verify first, then recover into a new pathname only; never modify a live
 * indexer database or resolve a target symlink. Destination must not exist.
 */
export async function restoreSyntheticIndexer(backupDirectory,targetPath){
 const directory=requireAbsolute(backupDirectory),target=requireAbsolute(targetPath);
 assertDirectory(directory);assertDirectory(path.dirname(target));
 const manifestFile=path.join(directory,MANIFEST);
 if(assertFile(manifestFile)>4096)throw Error('Oversized private backup manifest');
 const manifest=validatedManifest(JSON.parse(readFileSync(manifestFile,'utf8')));
 const snapshot=path.join(directory,SQLITE);
 if(assertFile(snapshot)!==manifest.bytes ||
    await digestFile(snapshot)!==manifest.sqliteSha256)
  throw Error('Indexer backup checksum mismatch');
 equalSnapshot(manifest,readVerifiedDatabase(snapshot));
 if(existsSync(target))throw Error('Restore destination already exists');
 // lstat also finds a dangling symlink, which existsSync does not.
 try{lstatSync(target);throw Error('Restore destination already exists');}
 catch(e){if(e.code!=='ENOENT')throw e;}
 const temp=path.join(path.dirname(target),
  '.palantiny-restore-'+randomBytes(12).toString('hex')+'.sqlite');
 try{
  copyFileSync(snapshot,temp,constants.COPYFILE_EXCL);
  chmodSync(temp,0o600);
  if(assertFile(temp)!==manifest.bytes ||
     await digestFile(temp)!==manifest.sqliteSha256)
   throw Error('Restored copy checksum mismatch');
  equalSnapshot(manifest,readVerifiedDatabase(temp));
  syncFile(temp);
  // Hard link is an atomic, fail-if-present install; rename would overwrite
  // a target that appeared during validation.
  linkSync(temp,target);
  unlinkSync(temp);
  syncDir(path.dirname(target));
  return Object.freeze({restored:true,targetPath:target,
   sqliteSha256:manifest.sqliteSha256,acceptedReports:manifest.acceptedReports,
   signedEnvelopes:manifest.signedEnvelopes});
 }finally{
  try{unlinkSync(temp);}catch(e){if(e.code!=='ENOENT')throw e;}
 }
}
