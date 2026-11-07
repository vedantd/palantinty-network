import {mkdirSync,lstatSync,readFileSync,writeFileSync,openSync,closeSync,unlinkSync,existsSync} from 'node:fs';
import path from 'node:path';
import {generateKeyPair,privateKeyFromProtobuf,privateKeyToProtobuf} from '@libp2p/crypto/keys';
import {peerIdFromPrivateKey} from '@libp2p/peer-id';

/**
 * M10b independent operator identity: persistent libp2p Ed25519 key.
 * Node key is stored in a private directory, mode 0700, file mode 0600.
 * The private key never leaves the operator machine or enters a manifest.
 * Local filesystem protections are not encryption at rest.
 */
export async function openPersistentPeerIdentity(directory,{create=true}={}){
 if(typeof directory!=='string'||!directory.trim())throw new TypeError('Private identity directory required');
 if(typeof create!=='boolean')throw new TypeError('create must be boolean');
 const dir=path.resolve(directory);
 if(create)mkdirSync(dir,{recursive:true,mode:0o700});
 const st=lstatSync(dir);
 if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0)
  throw new Error('Identity directory must be private 0700 and not a symlink');
 const keyFile=path.join(dir,'libp2p.ed25519.key');
 let privateKey;
 if(existsSync(keyFile)){
  const info=lstatSync(keyFile);
  if(!info.isFile()||info.isSymbolicLink()||(info.mode&0o177)!==0)
   throw new Error('Identity key must be a regular, private 0600 file');
  const bytes=readFileSync(keyFile);
  if(bytes.length<32||bytes.length>1024)throw new Error('Invalid identity key file size');
  privateKey=privateKeyFromProtobuf(bytes);
 }else{
  if(!create)throw new Error('Operator identity missing; refusing silent rotation');
  privateKey=await generateKeyPair('Ed25519');
  const raw=privateKeyToProtobuf(privateKey);
  // Exclusive write refuses silent overwrite in a concurrent startup.
  const fd=openSync(keyFile,'wx',0o600);
  try{
   writeFileSync(fd,raw);
  }catch(e){
   closeSync(fd);
   unlinkSync(keyFile);
   throw e;
  }
  closeSync(fd);
 }
 const peerId=peerIdFromPrivateKey(privateKey).toString();
 return Object.freeze({privateKey,peerId,keyFile});
}
