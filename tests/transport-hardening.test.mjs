import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {openLocalIdentity} from '../src/identity.mjs';
import {signReport} from '../src/protocol.mjs';
import {sendPrivateReport} from '../src/private-transport.mjs';

function fixture(fn){
 const dir=mkdtempSync(path.join(tmpdir(),'pulsemesh-ack-'));
 try{
  const key=openLocalIdentity(path.join(dir,'key'));
  const report={schema:'pulsemesh.activity.v1',area:'synthetic-cell',
   bucketStart:Date.UTC(2026,10,6,12),bucketSeconds:60,
   activityIndex:25,metric:'ble_alias_activity'};
  return fn(signReport(report,key,1));
 }finally{rmSync(dir,{recursive:true,force:true});}
}
function mockNode(response){
 let calls=0;
 return {get calls(){return calls;},async dialProtocol(){
  calls++;
  const stream=new EventTarget();
  stream.close=async()=>{};
  stream.send=()=>{
   queueMicrotask(()=>{
    const evt=new Event('message');
    evt.data=Buffer.from(JSON.stringify(response)+'\\n');
    stream.dispatchEvent(evt);
   });
  };
  return stream;
 }};
}
const ack=(id)=>({schema:'pulsemesh.ack.v1',ack:true,accepted:true,
 duplicate:false,code:'accepted',reportId:id});
test('invalid outbound envelope is rejected before opening a stream',async()=>{
 await fixture(async envelope=>{
  const node=mockNode(ack(envelope.body.reportId));
  envelope.body.report.activityIndex=100;
  await assert.rejects(sendPrivateReport(node,'peer',envelope));
  assert.equal(node.calls,0);
 });
});
test('ack for a different signed report cannot confirm delivery',async()=>{
 await fixture(async envelope=>{
  const node=mockNode(ack('a'.repeat(64)));
  await assert.rejects(sendPrivateReport(node,'peer',envelope),/Acknowledgment does not match/);
 });
});
test('valid matching ack succeeds and preserves report ID',async()=>{
 await fixture(async envelope=>{
  const response=await sendPrivateReport(mockNode(ack(envelope.body.reportId)),'peer',envelope);
  assert.equal(response.reportId,envelope.body.reportId);
 });
});
test('false ack cannot masquerade as accepted delivery',async()=>{
 await fixture(async envelope=>{
  const node=mockNode({...ack(envelope.body.reportId),accepted:false,duplicate:false});
  await assert.rejects(sendPrivateReport(node,'peer',envelope),/Acknowledgment does not match/);
 });
});
