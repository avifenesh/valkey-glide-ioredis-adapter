#!/usr/bin/env node

/**
 * Debug script to identify hanging handles in tests
 * Run a specific test and show what keeps the event loop alive
 */

import { spawn } from 'child_process';
import process from 'process';

const testFile = process.argv[2] || 'tests/integration/message-queues/bull-bee-queue-simple.test.mjs';

console.log(`\n🔍 Running test with handle tracking: ${testFile}\n`);

// Run the test with diagnostic flags
const child = spawn('node', [
  '--trace-warnings',
  '--trace-uncaught',
  '--test',
  '--test-concurrency=1',
  '--import', './tests/global-setup.mjs',
  testFile
], {
  env: {
    ...process.env,
    VALKEY_HOST: 'localhost',
    VALKEY_PORT: '6383',
    NODE_OPTIONS: '--trace-warnings'
  },
  stdio: 'inherit'
});

// Track child process
let testCompleted = false;

child.on('exit', (code) => {
  testCompleted = true;
  console.log(`\n✅ Test process exited with code: ${code}`);
  
  // Give a moment for any cleanup
  setTimeout(() => {
    console.log('\n🔍 Checking for remaining handles...\n');
    
    // Use why-is-node-running if available
    try {
      require('why-is-node-running')();
    } catch (e) {
      console.log('Install why-is-node-running for better diagnostics: npm install -D why-is-node-running');
    }
    
    // Force exit after analysis
    setTimeout(() => {
      console.log('\n⚠️ Force exiting after handle analysis');
      process.exit(code || 0);
    }, 2000);
  }, 1000);
});

// Safety timeout
setTimeout(() => {
  if (!testCompleted) {
    console.error('\n⏱️ Test timeout - killing process');
    child.kill('SIGTERM');
    setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGKILL');
      }
      process.exit(1);
    }, 1000);
  }
}, 30000);