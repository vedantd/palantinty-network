import test from 'node:test';
import assert from 'node:assert/strict';
import {parseP02cPilotLog,reviewP02cPilotEvidence} from '../src/p02c-pilot-evidence.mjs';

const a='12D3KooW'+'a'.repeat(44),b='12D3KooW'+'b'.repeat(44),report='a'.repeat(64);
function sample(role,peer,remote,event,extra={}){
 return {schema:'palantiny.p02c-pilot-evidence.v1',syntheticOnly:true,
  publicTestnetReady:false,realSensorData:false,pilotId:'local-ci-pilot',
  role,localPeerId:peer,remotePeerId:remote,event,...extra};
}
const ob=[sample('observer',a,b,'started'),sample('observer',a,b,
 'received-synthetic-report',{reportId:report,deliveryObserved:true})];
const pub=[sample('publisher',b,a,'started'),sample('publisher',b,a,
 'synthetic-published-no-ack',{reportId:report,deliveryObserved:false,delivered:false})];
test('offline reviewer confirms matching synthetic receipt without claiming physical verification',()=>{
 const results=reviewP02cPilotEvidence(ob,pub);
 assert.equal(results.observationCount,1);
 assert.deepEqual(results.matchedReportIds,[report]);
 assert.equal(results.remoteHostsVerified,false);
 assert.equal(results.publicTestnetReady,false);
});
test('refuses absent receipts, reused identity, mismatched pairs and synthetic-to-real contamination',()=>{
 assert.throws(()=>reviewP02cPilotEvidence(ob,pub.slice(0,1)));
 assert.throws(()=>reviewP02cPilotEvidence(ob,pub.map(x=>({...x,localPeerId:a}))));
 assert.throws(()=>reviewP02cPilotEvidence(ob,pub.map(x=>({...x,remotePeerId:b}))));
 assert.throws(()=>reviewP02cPilotEvidence(ob,[pub[0],{...pub[1],reportId:'b'.repeat(64)}]));
 assert.throws(()=>parseP02cPilotLog(JSON.stringify({...ob[0],realSensorData:true})));
 assert.throws(()=>parseP02cPilotLog(JSON.stringify({...ob[0],publicTestnetReady:true})));
 assert.throws(()=>parseP02cPilotLog(''));
 assert.throws(()=>parseP02cPilotLog('{}'));
 assert.throws(()=>parseP02cPilotLog('x'.repeat(300000)));
});
