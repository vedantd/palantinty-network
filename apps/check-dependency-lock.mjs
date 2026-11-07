#!/usr/bin/env node
/** H1a offline lockfile metadata check; not security certification. */
import {verifyCurrentDependencyLock} from '../src/dependency-lock-check.mjs';

try{console.log(JSON.stringify(verifyCurrentDependencyLock(),null,2));}
catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
