#!/usr/bin/env node
import {readFileSync,writeFileSync} from 'node:fs';
import {renderProgressSvg} from '../src/roadmap-progress.mjs';
const base=new URL('../',import.meta.url);
const read=path=>JSON.parse(readFileSync(new URL(path,base),'utf8'));
const output=new URL('assets/roadmap-progress.svg',base);
const expected=renderProgressSvg(read('config/release-execution-tracker.json'),read('config/public-release-gates.json'));
if(process.argv.includes('--check')){
 const current=readFileSync(output,'utf8');
 if(current!==expected){
  console.error('Roadmap SVG out of date; run: npm run roadmap:render');
  process.exitCode=1;
 }else console.log('Roadmap progress SVG matches current release trackers');
}else{
 writeFileSync(output,expected);
 console.log('Regenerated assets/roadmap-progress.svg');
}
