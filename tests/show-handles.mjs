#!/usr/bin/env node

/**
 * Use Node.js built-in diagnostics to find hanging handles
 */

import { after } from 'node:test';
import process from 'node:process';

// Track active handles
const activeHandles = new Set();
const originalSetTimeout = global.setTimeout;
const originalSetInterval = global.setInterval;

// Override setTimeout to track handles
global.setTimeout = function(...args) {
  const handle = originalSetTimeout.apply(this, args);
  activeHandles.add({ type: 'Timeout', handle, stack: new Error().stack });
  const originalUnref = handle.unref;
  if (originalUnref) {
    handle.unref = function() {
      activeHandles.delete(handle);
      return originalUnref.apply(this);
    };
  }
  return handle;
};

// Override setInterval to track handles  
global.setInterval = function(...args) {
  const handle = originalSetInterval.apply(this, args);
  activeHandles.add({ type: 'Interval', handle, stack: new Error().stack });
  return handle;
};

// Hook into test completion
after(async () => {
  console.log('\n🔍 Test suite completed - checking for active handles...\n');
  
  // Wait a moment for normal cleanup
  await new Promise(resolve => originalSetTimeout(resolve, 100));
  
  // Check process._getActiveHandles() if available
  if (process._getActiveHandles) {
    const handles = process._getActiveHandles();
    console.log(`\n📊 Active handles count: ${handles.length}`);
    
    handles.forEach((handle, index) => {
      console.log(`\nHandle #${index + 1}:`);
      console.log('  Type:', handle.constructor.name);
      
      // Check for common handle properties
      if (handle.fd !== undefined) {
        console.log('  File descriptor:', handle.fd);
      }
      if (handle.readable !== undefined) {
        console.log('  Readable:', handle.readable);
      }
      if (handle.writable !== undefined) {
        console.log('  Writable:', handle.writable);
      }
      if (handle._host) {
        console.log('  Host:', handle._host);
      }
      if (handle._port) {
        console.log('  Port:', handle._port);
      }
      if (handle.localAddress) {
        console.log('  Local Address:', handle.localAddress);
      }
      if (handle.localPort) {
        console.log('  Local Port:', handle.localPort);
      }
      if (handle.remoteAddress) {
        console.log('  Remote Address:', handle.remoteAddress);
      }
      if (handle.remotePort) {
        console.log('  Remote Port:', handle.remotePort);
      }
      
      // For TCP sockets
      if (handle.constructor.name === 'TCP' || handle.constructor.name === 'Socket') {
        console.log('  🔌 This is a TCP connection - likely a Redis connection not closed');
      }
      
      // For timers
      if (handle.constructor.name === 'Timeout' || handle.constructor.name === 'Timer') {
        console.log('  ⏱️ This is a timer - should be unref()\'d if not needed');
      }
    });
  }
  
  // Check process._getActiveRequests() if available
  if (process._getActiveRequests) {
    const requests = process._getActiveRequests();
    if (requests.length > 0) {
      console.log(`\n📊 Active requests count: ${requests.length}`);
      requests.forEach((req, index) => {
        console.log(`Request #${index + 1}:`, req.constructor.name);
      });
    }
  }
  
  // Check our tracked timers
  if (activeHandles.size > 0) {
    console.log(`\n⏰ Tracked timers: ${activeHandles.size}`);
    activeHandles.forEach(item => {
      console.log(`  - ${item.type}`);
      if (item.stack) {
        const lines = item.stack.split('\n').slice(1, 3);
        console.log('    Created at:', lines.join('\n    '));
      }
    });
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('⚠️  If TCP handles are shown, Redis connections are not closed');
  console.log('⚠️  If Timer handles are shown, they need .unref() calls');
  console.log('='.repeat(60));
  
  // Force exit after showing diagnostics
  originalSetTimeout(() => {
    console.log('\n💀 Force exiting after diagnostics...');
    process.exit(0);
  }, 1000);
});