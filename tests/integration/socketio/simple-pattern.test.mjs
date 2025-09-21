/**
 * Simple Socket.IO Pattern Test
 * Basic test of Socket.IO pattern functionality using Node.js built-in test runner
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { describeForEachMode, createClient } from '../../setup/dual-mode.mjs';
import { delay } from '../../utils/test-config.mjs';

// Global declarations for Node.js built-in globals
/* global console, Buffer */

describeForEachMode('Simple Socket.IO Pattern Test', mode => {
  let pubClient;
  let subClient;

  before(async () => {
    // Get dynamic configuration from test runner
    const eventOpts =
      mode === 'standalone' ? { enableEventBasedPubSub: true } : {};
    pubClient = await createClient(mode, eventOpts);
    subClient = await createClient(mode, eventOpts);

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
    }
  });

  it('should handle basic pattern subscription like Socket.IO adapter', async () => {
    const receivedMessages = [];

    // Set up pattern listener (Socket.IO uses pattern subscriptions)
    subClient.on('pmessage', (pattern, channel, message) => {
      const messageStr = Buffer.isBuffer(message)
        ? message.toString()
        : message;
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

    await pubClient.publish('socket.io#/#general#', testMessage);

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
  });
});
