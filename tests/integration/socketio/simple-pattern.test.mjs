/**
 * Simple Socket.IO Pattern Test
 * Basic test of Socket.IO pattern functionality using Node.js built-in test runner
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import pkg from '../../../dist/index.js';
const { Redis } = pkg;
import { getStandaloneConfig, delay } from '../../utils/test-config.mjs';

// Global declarations for Node.js built-in globals
/* global console, Buffer */

describe('Simple Socket.IO Pattern Test', () => {
  let pubClient;
  let subClient;

  before(async () => {
    // Get dynamic configuration from test runner
    const baseConfig = getStandaloneConfig();
    const config = {
      ...baseConfig,
      enableEventBasedPubSub: true, // Socket.IO compatibility mode
    };

    pubClient = new Redis(config);
    subClient = new Redis(config);

    // Connect both clients
    await pubClient.connect();
    await subClient.connect();
  });

  after(async () => {
    try {
      // Force immediate process exit after cleanup
      const cleanup = async () => {
        if (subClient) {
          // Remove all event listeners
          subClient.removeAllListeners();

          // Unsubscribe before disconnecting
          try {
            await subClient.punsubscribe();
          } catch {}

          // Clean shutdown with proper connection draining
          try {
            await subClient.quit();
          } catch {}

          // Additional cleanup for GLIDE connections
          if (
            subClient.disconnect &&
            typeof subClient.disconnect === 'function'
          ) {
            try {
              await subClient.disconnect();
            } catch {}
          }

          subClient = null;
        }
        if (pubClient) {
          try {
            await pubClient.quit();
          } catch {}

          // Additional cleanup for GLIDE connections
          if (
            pubClient.disconnect &&
            typeof pubClient.disconnect === 'function'
          ) {
            try {
              await pubClient.disconnect();
            } catch {}
          }

          pubClient = null;
        }

        // Allow time for connections to fully close
        await new Promise(resolve => setTimeout(resolve, 100).unref());

        // Force close any remaining handles
        const handles = process._getActiveHandles?.() || [];
        handles.forEach(handle => {
          if (handle && typeof handle.destroy === 'function') {
            try {
              handle.destroy();
            } catch {}
          } else if (handle && typeof handle.close === 'function') {
            try {
              handle.close();
            } catch {}
          }
        });
      };

      await cleanup();
    } catch (error) {
      // Ignore cleanup errors
      console.log('Cleanup error:', error.message);
    }
  });

  it('should handle basic pattern subscription like Socket.IO adapter', async () => {
    const receivedMessages = [];

    // Set up pattern listener (Socket.IO uses pattern subscriptions)
    subClient.on('pmessage', (pattern, channel, message) => {
      const messageStr = Buffer.isBuffer(message)
        ? message.toString()
        : message;
      console.log(
        `Received pattern message: ${pattern} -> ${channel}: ${messageStr.substring(0, 50)}`
      );
      receivedMessages.push({ pattern, channel, message: messageStr });
    });

    // Subscribe to Socket.IO-style pattern
    await subClient.psubscribe('socket.io#/#*');

    // Wait a bit for subscription to be established
    await delay(100);

    // Publish a Socket.IO-style message
    const testMessage = JSON.stringify({
      type: 'test',
      message: 'Hello from Node.js test',
      data: { framework: 'node:test' },
    });

    const publishResult = await pubClient.publish(
      'socket.io#/#general#',
      testMessage
    );
    console.log(`Publish result: ${publishResult}`);

    // Wait for message propagation with timeout
    const startTime = Date.now();
    while (receivedMessages.length === 0 && Date.now() - startTime < 5000) {
      await delay(50);
    }

    // Verify we received the pattern message
    assert.strictEqual(
      receivedMessages.length,
      1,
      'Should receive exactly one pattern message'
    );
    assert.strictEqual(
      receivedMessages[0].pattern,
      'socket.io#/#*',
      'Pattern should match subscription'
    );
    assert.strictEqual(
      receivedMessages[0].channel,
      'socket.io#/#general#',
      'Channel should match published channel'
    );
    assert.ok(
      receivedMessages[0].message.includes('Hello from Node.js test'),
      'Message should contain test content'
    );

    console.log(
      '✅ Socket.IO pattern subscription working with Node.js test runner'
    );
  });
});
