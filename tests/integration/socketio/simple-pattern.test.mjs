/**
 * Simple Socket.IO Pattern Test
 * Basic test of Socket.IO pattern functionality using Node.js built-in test runner
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import pkg from '../../../dist/index.js';
const { Redis } = pkg;

describe('Simple Socket.IO Pattern Test', () => {
  let pubClient;
  let subClient;

  before(async () => {
    // Simple configuration - use defaults and lazyConnect
    pubClient = new Redis({
      host: 'localhost',
      port,
      lazyConnect,
      enableEventBasedPubSub, // Socket.IO compatibility mode
    });
    
    subClient = new Redis({
      host: 'localhost',
      port,
      lazyConnect,
      enableEventBasedPubSub, // Socket.IO compatibility mode
    });
  });

  after(async () => {
    try {
      if (subClient) {
        // Unsubscribe before disconnecting
        await subClient.punsubscribe();
        await subClient.disconnect();
      }
      if (pubClient) {
        await pubClient.disconnect();
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should handle basic pattern subscription like Socket.IO adapter', async () => {
    const receivedMessages = [];
    
    // Set up pattern listener (Socket.IO uses pattern subscriptions)
    subClient.on('pmessage', (pattern, channel, message) => {
      const messageStr = Buffer.isBuffer(message) ? message.toString() ;
      console.log(`Received pattern message: ${pattern} -> ${channel}: ${messageStr.substring(0, 50)}`);
      receivedMessages.push({ pattern, channel, message: messageStr });
    });

    // Subscribe to Socket.IO-style pattern
    await subClient.psubscribe('socket.io#/#*');
    
    // Wait a bit for subscription to be established
    await new Promise(resolve => setTimeout(resolve, 100));

    // Publish a Socket.IO-style message
    const testMessage = JSON.stringify({
      type: 'test',
      message: 'Hello from Node.js test',
      data: { framework: 'node:test' },
    });

    const publishResult = await pubClient.publish('socket.io#/#general#', testMessage);
    console.log(`Publish result: ${publishResult}`);

    // Wait for message propagation with timeout
    const startTime = Date.now();
    while (receivedMessages.length === 0 && Date.now() - startTime  setTimeout(resolve, 50));
    }

    // Verify we received the pattern message
    assert.strictEqual(receivedMessages.length, 1, 'Should receive exactly one pattern message');
    assert.strictEqual(receivedMessages[0].pattern, 'socket.io#/#*', 'Pattern should match subscription');
    assert.strictEqual(receivedMessages[0].channel, 'socket.io#/#general#', 'Channel should match published channel');
    assert.ok(receivedMessages[0].message.includes('Hello from Node.js test'), 'Message should contain test content');

    console.log('✅ Socket.IO pattern subscription working with Node.js test runner!');
  });
});