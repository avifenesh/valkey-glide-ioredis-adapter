#!/usr/bin/env node
/**
 * Node.js Built-in Test Runner
 * Finds and runs all .mjs test files
 */

import { spawn } from 'child_process';
import { readdir } from 'fs/promises';
import { join } from 'path';

async function findTestFiles(dir) {
  const files = [];
  
  async function scanDir(currentDir) {
    try {
      const entries = await readdir(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);
        
        if (entry.isDirectory()) {
          await scanDir(fullPath);
        } else if (entry.name.endsWith('.test.mjs')) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }
  
  await scanDir(dir);
  return files;
}

async function runTests() {
  console.log('🔍 Finding Node.js test files (.mjs)...\n');
  
  const testFiles = await findTestFiles('tests');
  
  if (testFiles.length === 0) {
    console.log('No .mjs test files found');
    return;
  }
  
  console.log(`Found ${testFiles.length} test file(s):`);
  testFiles.forEach(file => console.log(`  - ${file}`));
  console.log('');
  
  // Run tests with Node.js built-in test runner
  const args = ['--test', ...testFiles];
  
  const testProcess = spawn('node', args, {
    stdio: 'inherit',
    env: { ...process.env }
  });
  
  testProcess.on('exit', (code) => {
    process.exit(code);
  });
}

runTests().catch(console.error);