#!/usr/bin/env node

/**
 * Advanced diagnostic to find what's keeping Node.js alive after tests
 */

import { createRequire } from 'module';
import { after } from 'node:test';

const require = createRequire(import.meta.url);

// Hook into test completion
after(async () => {
  console.log('\n🔍 Test suite completed - analyzing active handles...\n');
  
  // Small delay to let normal cleanup happen
  await new Promise(resolve => setTimeout(resolve, 100));
  
  try {
    // Use why-is-node-running to show what's keeping the process alive
    const whyIsNodeRunning = require('why-is-node-running');
    
    console.log('='.repeat(60));
    console.log('ACTIVE HANDLES PREVENTING NODE.JS EXIT:');
    console.log('='.repeat(60));
    
    whyIsNodeRunning();
    
    console.log('='.repeat(60));
    console.log('\n⚠️  The above handles are keeping the process alive');
    console.log('Each handle needs to be properly closed/unreferenced');
    console.log('='.repeat(60));
    
    // Force close after showing diagnostics
    setTimeout(() => {
      console.log('\n💀 Force exiting after diagnostics...');
      process.exit(0);
    }, 2000);
    
  } catch (error) {
    console.error('Error running diagnostics:', error);
  }
});