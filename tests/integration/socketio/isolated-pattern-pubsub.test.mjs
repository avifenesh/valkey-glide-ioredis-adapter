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
import { describeForEachMode, createClient } from '../../setup/dual-mode.mjs';
// No pre-checks; rely on test runner infra
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms).unref());
}
describe('Isolated Pattern Pub/Sub Test', () => {
  let pubClient;
  let subClient;

  before(async () => {
    pubClient = await createClient('standalone', {
      enableEventBasedPubSub: true,
    });
    subClient = await createClient('standalone', {
      enableEventBasedPubSub: true,
    });
  });

  after(async () => {
    await pubClient.disconnect();
    await subClient.disconnect();
  });

  it('should handle pattern subscriptions with both binary and text messages', async () => {
    const receivedText = [];
    const receivedBinary = [];

    subClient.on('pmessage', (pattern, channel, message) => {
      const msg = Buffer.isBuffer(message) ? message.toString() : message;
      receivedText.push({ pattern, channel, message: msg });
    });

    subClient.on('pmessageBuffer', (pattern, channel, message) => {
      receivedBinary.push({ pattern, channel, message });
    });

    // Subscribe to pattern
    await subClient.psubscribe('socket.io#/#*');

    // Publish a message to a matching channel
    const testMessage = JSON.stringify({
      type: 'test',
      message: 'Pattern message',
      payload: { id: 1 },
    });

    const result = await pubClient.publish('socket.io#/#general#', testMessage);

    // Wait for message to be received
    await new Promise(resolve => setTimeout(resolve, 100).unref());

    // Assertions
    const textMsg = receivedText.find(
      m => m.channel === 'socket.io#/#general#'
    );
    const binMsg = receivedBinary.find(
      m => m.channel === 'socket.io#/#general#'
    );

    assert.ok(textMsg);
    assert.ok(binMsg);
  });
});
