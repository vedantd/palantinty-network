#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { evaluateCalibration, parseManualCountsCsv } from '../src/calibration.mjs';

function argumentsFrom(argv) {
  const args = new Map();
  for (const entry of argv) {
    const match = entry.match(/^--(scan|manual|template)=(.*)$/);
    if (!match || args.has(match[1])) throw new Error(
      'Usage: npm run calibrate -- --scan=FILE.json --manual=FILE.csv\n' +
      '   or: npm run calibrate -- --scan=FILE.json --template=csv');
    args.set(match[1], match[2]);
  }
  if (!args.has('scan')) throw new Error('--scan=FILE.json is required');
  const template = args.get('template');
  if ((template !== undefined && template !== 'csv') ||
      Boolean(template) === args.has('manual'))
    throw new Error('Choose exactly one of --manual=FILE.csv or --template=csv');
  return args;
}
function main() {
  const args = argumentsFrom(process.argv.slice(2));
  const scan = JSON.parse(readFileSync(path.resolve(args.get('scan')), {encoding:'utf8',flag:'r'}));
  if (scan.schema !== 'pulsemesh.scan.local.v1' || !Array.isArray(scan.closedWindows))
    throw new Error('Unsupported scan summary format');
  if (args.has('template')) {
    console.log('bucketStart,manualCount');
    for (const w of scan.closedWindows) {
      if (!Number.isSafeInteger(w.bucketStart) || w.bucketStart < 0)
        throw new Error('Invalid scan bucket');
      console.log(`${new Date(w.bucketStart).toISOString()},`);
    }
    return;
  }
  const csv=readFileSync(path.resolve(args.get('manual')),'utf8');
  const result=evaluateCalibration(scan,parseManualCountsCsv(csv));
  console.log(JSON.stringify(result,null,2));
  if (result.status!=='exploratory_statistics_available') {
    process.exitCode=2; // Intentional failure for insufficient measurement evidence.
  }
}
try {main();} catch(e) {
  // No untrusted file contents are included in errors.
  console.error('Calibration failed:',e.message);
  process.exitCode=1;
}
