import {readFileSync} from 'node:fs';

/**
 * H1a build integrity guard: ensures every npm package is pinned to an
 * integrity-checked registry tarball, with matching root dependencies.
 *
 * Does NOT assess package safety or vouch for registry publisher identity.
 */
export function validateLockedDependencies(pkg,lock){
 if(pkg===null||typeof pkg!=='object'||!pkg.dependencies||
    lock?.lockfileVersion!==3||
    lock?.name!==pkg.name||lock?.version!==pkg.version||
    !lock.packages||typeof lock.packages!=='object')
  throw Error('Invalid package.json/lockfile pair');
 const keys=Object.keys(lock.packages);
 if(keys.length<2||keys.length>2000||
    JSON.stringify(Object.keys(lock.packages['']?.dependencies||{}).sort())!==
    JSON.stringify(Object.keys(pkg.dependencies).sort()))
  throw Error('Lockfile root dependency set differs from package.json');
 for(const [name,range] of Object.entries(pkg.dependencies)){
  if(lock.packages[''].dependencies[name]!==range)
   throw Error('Lockfile root dependency range drift: '+name);
  if(typeof lock.packages['node_modules/'+name]?.version!=='string')
   throw Error('Missing installed direct dependency: '+name);
 }
 let integrityCount=0;
 for(const [key,entry] of Object.entries(lock.packages)){
  if(key==='')continue;
  if(!key.startsWith('node_modules/')||
     typeof entry.version!=='string'||!entry.version||
     typeof entry.resolved!=='string'||
     !entry.resolved.startsWith('https://registry.npmjs.org/')||
     typeof entry.integrity!=='string'||
     !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(entry.integrity))
   throw Error('Unpinned or unsafe package source: '+key);
  integrityCount++;
 }
 return Object.freeze({schema:'palantiny.h1a-dependency-lock.v1',name:pkg.name,
  lockfileVersion:lock.lockfileVersion,pinnedPackages:integrityCount,
  approvedForProduction:false,
  note:'Immutable integrity-checked install metadata is not a vulnerability assessment or a signed release'});
}
export function verifyCurrentDependencyLock(){
 const pkg=JSON.parse(readFileSync('package.json','utf8'));
 const lock=JSON.parse(readFileSync('package-lock.json','utf8'));
 return validateLockedDependencies(pkg,lock);
}
