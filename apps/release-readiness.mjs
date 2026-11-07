#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {evaluatePublicReleaseGates} from '../src/release-readiness.mjs';
const profile=process.argv[2]??'open-synthetic-testnet';
const assertBlocked=process.argv.includes('--assert-blocked');
try{
 const config=JSON.parse(readFileSync(new URL('../config/public-release-gates.json',import.meta.url),'utf8'));
 const status=evaluatePublicReleaseGates(config,profile);
 console.log(JSON.stringify(status,null,2));
 if(assertBlocked?status.ready:!status.ready)process.exitCode=1;
}catch(error){
 console.error(error instanceof Error?error.message:String(error));
 process.exitCode=2;
}
