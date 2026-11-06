#!/usr/bin/env node
import { mkdtempSync,rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { openLocalIdentity } from '../src/identity.mjs';
import { signReport } from '../src/protocol.mjs';
import { RegionalIngest } from '../src/regional-ingest.mjs';
import { createPrivateNode,registerPrivateIngest,sendPrivateReport } from '../src/private-transport.mjs';

const dir=mkdtempSync(path.join(tmpdir(),'pulsemesh-m04-'));
const nodes=[];
try {
  const now=Date.UTC(2026,10,6,20,0,0);
  const ids=['sensorA','sensorB'].map(name=>openLocalIdentity(path.join(dir,name)));
  const receiver=new RegionalIngest({authorizedKeys:new Set(ids.map(i=>i.keyId)),now:()=>now,minOperators:2});
  const [aggregator,nodeA,nodeB]=await Promise.all(
    Array.from({length:3},()=>createPrivateNode())
  );
  nodes.push(aggregator,nodeA,nodeB);
  registerPrivateIngest(aggregator,receiver);
  // No bootstrap, discovery or public broadcast. Only loopback preselected peers.
  for(const node of [nodeA,nodeB]){
    await node.peerStore.patch(aggregator.peerId,{multiaddrs:aggregator.getMultiaddrs()});
  }
  const report=(index)=>({
    schema:'pulsemesh.activity.v1',area:'synthetic-test-region',
    bucketStart:now-20*60_000,bucketSeconds:60,
    activityIndex:index,metric:'ble_alias_activity'
  });
  const first=signReport(report(25),ids[0],1);
  const second=signReport(report(35),ids[1],1);
  const a=await sendPrivateReport(nodeA,aggregator.peerId,first);
  const retry=await sendPrivateReport(nodeA,aggregator.peerId,first);
  const b=await sendPrivateReport(nodeB,aggregator.peerId,second);
  if(!a.ack||!b.ack||!retry.ack||!retry.duplicate)throw Error('Expected ACKs and a duplicate retry');
  const regions=receiver.released();
  if(regions.length!==1||regions[0].sources!==2)throw Error('Regional coverage gate failed');
  console.log(JSON.stringify({
    simulation:true,hardware:false,transport:'libp2p-tcp-noise-yamux',
    loopbackOnly:true,network:true,publicBroadcast:false,
    sent:2,retried:1,accepted:receiver.stats().accepted,
    duplicateRetryAcknowledged:retry.duplicate,
    regionalData:regions,
    note:'Synthetic aggregate reports only. Not validated people counts or production anonymity.'
  },null,2));
}finally{
  await Promise.allSettled(nodes.map(n=>n.stop()));
  rmSync(dir,{recursive:true,force:true});
}
