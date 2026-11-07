/**
 * Private synthetic pilot operation boundary.
 *
 * Revalidates local peer approval immediately before and after one awaited
 * network operation (dial, publish). A post-check prevents callers from
 * reporting success when revocation happened during the await.
 *
 * This does not interrupt synchronous network side-effects already performed,
 * close remote TCP connections atomically, or replace the live watchdog.
 */
export async function runPrivatePilotOperation(checkTrust,action){
 if(typeof checkTrust!=='function'||typeof action!=='function')
  throw new TypeError('Trust callback and async operation required');
 checkTrust();
 let value,error,failed=false;
 try{value=await action();}
 catch(e){failed=true;error=e;}
 // Security failure takes precedence over network outcome; the trust guard
 // trips once and the calling process must stop its libp2p node.
 checkTrust();
 if(failed)throw error;
 return value;
}
