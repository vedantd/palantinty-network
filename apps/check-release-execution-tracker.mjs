#!/usr/bin/env node
/** Structural check only. This never upgrades public release evidence. */
import {checkReleaseExecutionFiles} from '../src/release-execution-tracker.mjs';
try{console.log(JSON.stringify(checkReleaseExecutionFiles(),null,2));}
catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
