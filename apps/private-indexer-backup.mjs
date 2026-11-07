#!/usr/bin/env node
/** Explicit offline, private synthetic-indexer recovery tool. */
import {backupSyntheticIndexer,restoreSyntheticIndexer} from '../src/private-indexer-backup.mjs';
const [command,source,destination,...extra]=process.argv.slice(2);
if(!['backup','restore'].includes(command)||!source||!destination||extra.length){
 console.error('Usage: node apps/private-indexer-backup.mjs <backup|restore> <source> <destination>');
 process.exitCode=2;
}else{
 try{
  const result=command==='backup'
   ?await backupSyntheticIndexer(source,destination)
   :await restoreSyntheticIndexer(source,destination);
  console.log(JSON.stringify({operation:command,
   syntheticOnly:true,publicTestnetReady:false,
   acceptedReports:result.acceptedReports,
   signedEnvelopes:result.signedEnvelopes,
   sqliteSha256:result.sqliteSha256,
   ...(command==='backup'?{backupDirectory:result.backupDirectory}:{targetPath:result.targetPath})}));
 }catch(error){
  console.error(JSON.stringify({operation:command,ok:false,
   error:error instanceof Error?error.message:'Operation failed',
   syntheticOnly:true,publicTestnetReady:false}));
  process.exitCode=1;
 }
}
