import {multiaddr} from '@multiformats/multiaddr';

/**
 * Narrow M10 transport policy. Neither a private IP nor Noise encryption
 * makes a public sensor network safe; keep peer IDs explicitly pinned.
 */
export function isTrustedAddressIp(ip,{allowPrivateLan=false}={}) {
 if(typeof ip!=='string'||typeof allowPrivateLan!=='boolean')return false;
 const parts=ip.split('.');
 if(parts.length!==4||parts.some(s=>!/^(?:0|[1-9][0-9]{0,2})$/.test(s)||Number(s)>255))
   return false;
 const [a,b,c,d]=parts.map(Number);
 if(a===127&&b===0&&c===0&&d===1)return true;
 return allowPrivateLan && (a===10 ||
   a===172 && b>=16 && b<=31 ||
   a===192 && b===168);
}

export function parseTrustedListen(address,{allowPrivateLan=false}={}) {
 const match=typeof address==='string'&&
   /^\/ip4\/([^/]+)\/tcp\/(0|[1-9][0-9]{0,4})$/.exec(address);
 if(!match||!isTrustedAddressIp(match[1],{allowPrivateLan})||
    Number(match[2])>65535)
   throw new Error('Explicit private LAN opt-in and concrete RFC1918/loopback listener required');
 return multiaddr(address);
}

export function parseTrustedIndexerSeed(address,{allowPrivateLan=false}={}) {
 const match=typeof address==='string'&&
   /^\/ip4\/([^/]+)\/tcp\/([1-9][0-9]{0,4})\/p2p\/([A-Za-z0-9]+)$/.exec(address);
 if(!match||!isTrustedAddressIp(match[1],{allowPrivateLan})||
    Number(match[2])>65535)
   throw new Error('Explicit private LAN opt-in, concrete RFC1918/loopback seed and Peer ID required');
 return multiaddr(address);
}

export function isTrustedRemoteAddress(address,{allowPrivateLan=false}={}) {
 const m=typeof address==='string'&&/^\/ip4\/([^/]+)\/tcp\/(?:0|[1-9][0-9]{0,4})(?:\/.*)?$/.exec(address);
 return Boolean(m&&isTrustedAddressIp(m[1],{allowPrivateLan}));
}
