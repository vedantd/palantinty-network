import {createHash} from 'node:crypto';

// Fictional routing cells, *not* latitude/longitude or population tiles.
// This namespace must not be used to encode real BLE-derived geography.
const SCENARIO=/^[a-z][a-z0-9]{2,11}$/;
const KEY=/^syn:([a-z][a-z0-9]{2,11})-c([0-9a-z]{2})$/;
const MAX_CELL=63;
const LOOKUP_DOMAIN='palantiny.synthetic-region-lookup.v1\0';
const exact=(x,keys)=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));

export function syntheticRegionKey(options={}){
 if(!exact(options,['scenario','cellIndex']))
  throw Error('Only synthetic scenario and cell index are permitted');
 const {scenario,cellIndex}=options;
 if(typeof scenario!=='string'||!SCENARIO.test(scenario)||
    !Number.isSafeInteger(cellIndex)||cellIndex<0||cellIndex>MAX_CELL)
  throw Error('Expected a fictional synthetic scenario and bounded cell index');
 return 'syn:'+scenario+'-c'+cellIndex.toString(36).padStart(2,'0');
}

export function parseSyntheticRegionKey(key){
 if(typeof key!=='string')throw Error('Invalid synthetic region key');
 const match=KEY.exec(key);
 if(!match)throw Error('Invalid synthetic region key');
 const scenario=match[1],cellIndex=Number.parseInt(match[2],36);
 if(cellIndex>MAX_CELL || syntheticRegionKey({scenario,cellIndex})!==key)
  throw Error('Noncanonical or out-of-range synthetic region key');
 return Object.freeze({scenario,cellIndex});
}

/**
 * Deterministic, sorted set of canonical fictional region keys for signing.
 * The existing D01 coverage-advertisement protocol caps regions at 16.
 */
export function syntheticCoverageRegions(options={}){
 if(!exact(options,['scenario','cellIndices']))
  throw Error('Only synthetic scenario and cell indices are permitted');
 const {scenario,cellIndices}=options;
 if(!Array.isArray(cellIndices)||cellIndices.length<1||cellIndices.length>16||
    new Set(cellIndices).size!==cellIndices.length)
  throw Error('Expected 1..16 distinct synthetic region indices');
 return Object.freeze(cellIndices.map(cellIndex=>
  syntheticRegionKey({scenario,cellIndex})).sort());
}

/**
 * Domain-separated hash usable by a future private routing adapter. This is
 * not a libp2p provider registration, a CID, or verified location evidence.
 */
export function syntheticRegionRoutingDigest(key){
 parseSyntheticRegionKey(key);
 return createHash('sha256').update(LOOKUP_DOMAIN,'utf8')
  .update(key,'utf8').digest();
}
