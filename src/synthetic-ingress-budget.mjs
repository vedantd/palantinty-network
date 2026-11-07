/**
 * P02b-2: bounded, process-local testnet observer work budget.
 * A single global budget applies regardless of forwarding PeerId rotation.
 * This is observer-side mitigation, NOT a libp2p network flood firewall.
 */
export function createSyntheticIngressBudget({
 windowMs=60_000,maxMessages=128,maxBytes=262_144,
 maxSeenReports=128,now=()=>Date.now()
}={}){
 for(const v of [windowMs,maxMessages,maxBytes,maxSeenReports]){
  if(!Number.isSafeInteger(v)||v<1||v>10_000_000)
   throw new RangeError('Invalid global synthetic ingress budget');
 }
 if(typeof now!=='function')throw new TypeError('Clock required');
 let started=null,messages=0,bytes=0;
 const seen=new Set();
 const clock=()=>{
  const value=now();
  if(!Number.isSafeInteger(value)||value<0)
   throw new Error('Invalid synthetic ingress clock');
  if(started===null||value<started||value-started>=windowMs){
   started=value;messages=0;bytes=0;seen.clear();
  }
 };
 return Object.freeze({
  /**
   * Charge bytes BEFORE JSON/signature verification. Oversized and empty
   * messages still consume a message unit; exhausted budget fails closed.
   */
  allowPacket(packet){
   clock();
   if(!(packet instanceof Uint8Array))return false;
   const size=packet.byteLength;
   if(messages>=maxMessages||size>maxBytes-bytes)return false;
   messages++;bytes+=size;
   return true;
  },
  /**
   * One callback per report ID per window. A bounded set refuses new IDs
   * rather than evicting and accidentally replaying old observations.
   */
  firstReport(reportId){
   clock();
   if(typeof reportId!=='string'||! /^[a-f0-9]{64}$/i.test(reportId))
    return false;
   if(seen.has(reportId)||seen.size>=maxSeenReports)return false;
   seen.add(reportId);
   return true;
  },
  stats(){
   clock();
   return Object.freeze({messages,bytes,seenReports:seen.size});
  }
 });
}
