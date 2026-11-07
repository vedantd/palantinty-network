import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openLocalIdentity} from '../src/identity.mjs';
import {SignedOutbox} from '../src/outbox.mjs';
import {DurableRegionalIngest} from '../src/durable-ingest.mjs';
const now=Date.UTC(2026,10,6,22);
function setup(fn){
 const dir=mkdtempSync(path.join(tmpdir(),'pulsemesh-schema-'));
 try{
  const identity=openLocalIdentity(path.join(dir,'identity'));
  const dbPath=path.join(dir,'data','store.sqlite');
  mkdirSync(path.dirname(dbPath),{recursive:true,mode:0o700});
  const outbox=()=>new SignedOutbox({dbPath,identity,now:()=>now});
  const regional=()=>new DurableRegionalIngest({dbPath,authorizedKeys:new Set([identity.keyId]),now:()=>now});
  return fn({dbPath,outbox,regional});
 }finally{rmSync(dir,{recursive:true,force:true});}
}
for(const kind of ['outbox','regional']){
 test(kind+' initializes and preserves v1 schema across restart',()=>setup(({dbPath,...factories})=>{
  const create=factories[kind];
  let store=create();store.close();
  let db=new DatabaseSync(dbPath);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version,1);
  db.close();
  store=create();store.close();
 }));
 test(kind+' refuses unknown future schema without modifying it',()=>setup(({dbPath,...factories})=>{
  const create=factories[kind];
  let store=create();store.close();
  const db=new DatabaseSync(dbPath);
  db.exec('PRAGMA user_version=99');db.close();
  assert.throws(create,/Unsupported .* schema version/);
  const reopened=new DatabaseSync(dbPath);
  assert.equal(reopened.prepare('PRAGMA user_version').get().user_version,99);
  reopened.close();
 }));
 test(kind+' rejects incomplete unversioned database instead of repairing silently',()=>setup(({dbPath,...factories})=>{
  const db=new DatabaseSync(dbPath);
  db.exec('CREATE TABLE unrelated (id INTEGER)');db.close();
  assert.throws(factories[kind],/Incomplete legacy/);
 }));
 test(kind+' rejects corrupted database before reading tables',()=>setup(({dbPath,...factories})=>{
  const db=new DatabaseSync(dbPath);
  db.exec('CREATE TABLE damaged (value TEXT)');
  db.exec("INSERT INTO damaged VALUES('original')");
  db.exec('PRAGMA writable_schema=ON');
  db.exec("UPDATE sqlite_master SET sql='not valid SQL' WHERE name='damaged'");
  db.exec('PRAGMA writable_schema=OFF');
  db.close();
  assert.throws(factories[kind]);
 }));
}
