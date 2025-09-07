/**
 * Isolated Pattern Pub/Sub Test
 *
 * Tests the IoredisPubSubClient pattern functionality in isolation
 */

import {
  describe,
  it,
  test,
  beforeEach,
  afterEach,
  before,
  after,
} from 'node:test';
import assert from 'node:assert';
import pkg from '../../../dist/index.js';
const { Redis } = pkg;
import { getStandaloneConfig } from '../../utils/test-config.mjs';

async function checkTestServers() {
  try {
    const config = getStandaloneConfig();
    const testClient = new Redis(config);
    await testClient.connect();
    await testClient.ping();
    await testClient.quit();
    return true;
  } catch (error) {
    return false;
  }
}
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
describe('Isolated Pattern Pub/Sub Test', () => {
  let pubClient;
  let subClient;

  before(async () => {
    const serversAvailable = await checkTestServers();
    if (!serversAvailable) {
      throw new Error('Test servers not available');
    }

    const config = await getStandaloneConfig();

    // Use hybrid mode for Socket.IO compatibility
    pubClient = new Redis({
      ...config,
      enableEventBasedPubSub: true,
    });
    subClient = new Redis({
      ...config,
      enableEventBasedPubSub: true,
    });
  });

  after(async () => {
    await pubClient.disconnect();
    await subClient.disconnect();
  });

  test('Pattern subscription works with IoredisPubSubClient', async () => {
    let receivedPatternMessages = [];
    let receivedBufferMessages = [];

    // Set up pattern message listeners
    subClient.on('pmessage', (pattern, channel, message) => {
      const messageStr = Buffer.isBuffer(message)
        ? message.toString()
        : message;
      console.log(
        'Test received pmessage - pattern:',
        pattern,
        'channel:',
        channel,
        'message:',
        messageStr.substring(0, 50)
      );
      receivedPatternMessages.push({ pattern, channel, message: messageStr });
    });

    subClient.on('pmessageBuffer', (pattern, channel, message) => {
      console.log(
        'Test received pmessageBuffer - pattern:',
        pattern,
        'channel:',
        channel,
        'messageSize:',
        message.length
      );
      receivedBufferMessages.push({ message, pattern, channel });
    });

    // Subscribe to Socket.IO pattern
    console.log('Subscribing to pattern: socket.io#/#*');
    await subClient.psubscribe('socket.io#/#*');

    // Wait for subscription to be established
    await delay(200);

    // Publish a message to a matching channel
    console.log('Publishing to socket.io#/#general#');
    const testMessage = JSON.stringify({
      type: 'test',
      message: 'Hello from pattern test',
      data: { foo: 'bar' },
    });

    const result = await pubClient.publish('socket.io#/#general#', testMessage);
    console.log('Publish result:', result);

    // Wait for message to be received
    await delay(500);

    // Check if we received the pattern message
    assert.strictEqual(receivedPatternMessages.length, 1);
    assert.strictEqual(receivedPatternMessages[0]?.pattern, 'socket.io#/#*');
    assert.strictEqual(
      receivedPatternMessages[0]?.channel,
      'socket.io#/#general#'
    );
    assert.ok(
      receivedPatternMessages[0]?.message.includes('Hello from pattern test')
    );

    // Check if we received the buffer message
    assert.strictEqual(receivedBufferMessages.length, 1);
    assert.strictEqual(receivedBufferMessages[0]?.pattern, 'socket.io#/#*');
    assert.strictEqual(
      receivedBufferMessages[0]?.channel,
      'socket.io#/#general#'
    );

    console.log('✅ Pattern pub/sub test completed successfully');
  });
});
