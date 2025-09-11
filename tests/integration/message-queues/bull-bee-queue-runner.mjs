#!/usr/bin/env node

/**
 * Subprocess runner for Bull/BeeQueue tests
 * This runs the tests in an isolated process to avoid hanging issues
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const testFile = join(__dirname, 'bull-bee-queue.test.mjs');

// Run the test in a subprocess
const child = spawn('node', ['--test', '--test-concurrency=1', testFile], {
  env: {
    ...process.env,
    VALKEY_HOST: process.env.VALKEY_HOST || 'localhost',
    VALKEY_PORT: process.env.VALKEY_PORT || '6383',
  },
  stdio: 'inherit',
});

// Set a timeout to kill the process if it hangs
const timeout = setTimeout(() => {
  console.error('Test timeout - killing subprocess');
  child.kill('SIGTERM');
  setTimeout(() => {
    if (!child.killed) {
      child.kill('SIGKILL');
    }
  }, 1000);
}, 30000); // 30 second timeout

child.on('exit', (code) => {
  clearTimeout(timeout);
  process.exit(code || 0);
});

child.on('error', (err) => {
  clearTimeout(timeout);
  console.error('Failed to run tests:', err);
  process.exit(1);
});