import {multiaddr} from '@multiformats/multiaddr';
import {setTimeout as delay} from 'node:timers/promises';

/**
 * M08a controlled bootstrap: connect only to a pre-provisioned local peer.
 * It is deliberately NOT public discovery or NAT traversal.
 */
export function parseLocalSeed(address) {
 if(typeof address!=='string' ||
    !/^\/ip4\/127\.0\.0\.1\/tcp\/[1-9]\d{0,4}\/p2p\/[A-Za-z0-9]+$/.test(address))
  throw new Error('Expected explicit loopback seed multiaddr with peer ID');
 const addr=multiaddr(address);
 const port=Number(address.split('/')[4]);
 if(port>65535)throw new Error('Seed port out of range');
 return addr;
}

/**
 * Bounded, explicit reconnection attempts.
 * Success proves a peer connection, NOT gossip replay or guaranteed delivery.
 */
export async function connectLocalSeed(node,address,{
 attempts=4,baseDelayMs=50,sleep=delay
}={}) {
 const addr=parseLocalSeed(address);
 if(!Number.isSafeInteger(attempts)||attempts<1||attempts>10 ||
    !Number.isSafeInteger(baseDelayMs)||baseDelayMs<0||baseDelayMs>10_000 ||
    typeof sleep!=='function')throw new RangeError('Invalid reconnect policy');
 if(!node || typeof node.dial!=='function')throw new TypeError('Node with dial() required');
 let error;
 for(let i=0;i<attempts;i++){
  try{
   const connection=await node.dial(addr);
   return Object.freeze({connected:true,attempts:i+1,remotePeer:address.split('/').at(-1)});
  }catch(e){
   error=e;
   if(i<attempts-1)await sleep(Math.min(10_000,baseDelayMs*2**i));
  }
 }
 throw new Error('Loopback peer unreachable after '+attempts+' attempts',{cause:error});
}
