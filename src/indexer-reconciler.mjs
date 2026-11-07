import {parseTrustedIndexerSeed} from './private-lan-policy.mjs';
import {synchronizeTrustedIndexer,fetchTrustedIndexerSummary} from './indexer-sync.mjs';

/**
 * M09c: run bounded reconciliation cycles automatically against one explicitly
 * trusted localhost indexer. No public peer discovery or real sensor inputs.
 *
 * Cursor is intentionally process-local. On process restart, replay begins at
 * the start of the source archive; report IDs make it idempotent. A cursor
 * only advances when a complete page is durably accepted or deduplicated.
 */
export function createTrustedIndexerReconciler({
  node,index,peerAddress,allowedSourcePeerIds,area,
  intervalMs=5_000,pageSize=4,maxReportsPerRound=32,timeoutMs=3_000,
  allowPrivateLan=false,
  synchronize=synchronizeTrustedIndexer,
  fetchSummary=fetchTrustedIndexerSummary,
  onError=()=>{}
}={}) {
  if(!index||typeof index.ingest!=='function'||
     typeof index.signedArchiveSummary!=='function')
    throw new TypeError('Local durable indexer with summary required');
  if(!(allowedSourcePeerIds instanceof Set)||allowedSourcePeerIds.size===0)
    throw new TypeError('Explicit trusted indexer PeerIDs required');
  if(!Number.isSafeInteger(intervalMs)||intervalMs<100||intervalMs>3_600_000||
     !Number.isSafeInteger(pageSize)||pageSize<1||pageSize>8||
     !Number.isSafeInteger(maxReportsPerRound)||maxReportsPerRound<1||
     maxReportsPerRound>128||
     !Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>60_000)
    throw new RangeError('Invalid reconciliation scheduling bounds');
  if(typeof synchronize!=='function'||typeof fetchSummary!=='function'||
     typeof onError!=='function')
    throw new TypeError('Invalid reconciliation handlers');

  // Enforce peer/area validation before scheduling. Actual endpoint
  // authentication is enforced again by each sync and summary invocation.
  if(typeof area!=='string'||!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(area)||
     !allowedSourcePeerIds.has(peerAddress?.split('/').at(-1)))
    throw new Error('Trusted source address/area required');
  parseTrustedIndexerSeed(peerAddress,{allowPrivateLan});

  const common={node,index,peerAddress,allowedSourcePeerIds,area,timeoutMs,allowPrivateLan};
  const summaryArgs={node,peerAddress,allowedSourcePeerIds,area,timeoutMs,allowPrivateLan};
  let cursor='',running=null,timer=null;
  const counters={
    rounds:0,failures:0,accepted:0,duplicates:0,pages:0,
    agreements:0,disagreements:0,lastAgreement:null,lastError:null
  };
  function stats() {
    return Object.freeze({
      ...counters,running:running!==null,
      scheduled:timer!==null,hasPendingCursor:cursor!==''
    });
  }
  async function runOnce() {
    // A queued timer never overlaps another pass or advances the same cursor.
    if(running!==null)return running;
    const work=(async()=>{
      counters.rounds++;
      try{
        const outcome=await synchronize({
          ...common,pageSize,maxReports:maxReportsPerRound,
          afterReportId:cursor,
          onPage:page=>{
            // Checkpoint only after an entire page has been committed.
            cursor=page.lastReportId;
          }
        });
        counters.accepted+=outcome.accepted;
        counters.duplicates+=outcome.duplicate;
        counters.pages+=outcome.pages;
        if(outcome.hasMore){
          return Object.freeze({status:'partial',...outcome,agreement:null});
        }
        // A complete scan must restart from the beginning next round:
        // new signed reports can sort earlier than the previous last ID.
        cursor='';
        const remote=await fetchSummary(summaryArgs);
        const local=index.signedArchiveSummary({area});
        const agrees=remote.count===local.count&&remote.digest===local.digest;
        counters.lastAgreement=agrees;
        counters[agrees?'agreements':'disagreements']++;
        return Object.freeze({status:agrees?'consistent':'divergent',
          ...outcome,agreement:agrees});
      }catch(error){
        counters.failures++;
        counters.lastError=error instanceof Error?error.message:'Unknown reconciliation error';
        try{onError(error);}catch{}
        return Object.freeze({status:'failed',error:counters.lastError});
      }
    })();
    running=work;
    try{return await work;}finally{running=null;}
  }
  function start() {
    if(timer!==null)return false;
    timer=setInterval(()=>{void runOnce();},intervalMs);
    timer.unref?.();
    void runOnce(); // Start immediately; no need to wait for first period.
    return true;
  }
  function stop() {
    if(timer===null)return false;
    clearInterval(timer);timer=null;
    // In-flight sync may finish normally, but no new attempts are scheduled.
    return true;
  }
  return Object.freeze({start,stop,runOnce,stats});
}
