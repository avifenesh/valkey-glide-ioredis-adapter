/**
 * Isolated Pattern Pub/Sub Test
 *
 * Tests the IoredisPubSubClient pattern functionality in isolation
 */

import { Redis } from '../../../src';
import { testUtils } from '../../setup';

describe('Isolated Pattern Pub/Sub Test', () => {
  let pubClient: Redis;
  let subClient: Redis;

  beforeAll(async () => {
    const serversAvailable = await testUtils.checkTestServers();
    if (!serversAvailable) {
      throw new Error('Test servers not available');
    }

    const config = await testUtils.getStandaloneConfig();

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

  afterAll(async () => {
    await pubClient.disconnect();
    await subClient.disconnect();
  });

  test('Pattern subscription works with IoredisPubSubClient', async () => {
    let receivedPatternMessages: Array<{
      pattern: string;
      channel: string;
      message: string;
    }> = [];
    let receivedBufferMessages: Array<{
      message: Buffer;
      pattern: string;
      channel: string;
    }> = [];

    // Set up pattern message listeners
    subClient.on(
      'pmessage',
      (pattern: string, channel: string, message: string | Buffer) => {
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
      }
    );

    subClient.on(
      'pmessageBuffer',
      (pattern: string, channel: string, message: Buffer) => {
        console.log(
          'Test received pmessageBuffer - pattern:',
          pattern,
          'channel:',
          channel,
          'messageSize:',
          message.length
        );
        receivedBufferMessages.push({ message, pattern, channel });
      }
    );

    // Subscribe to Socket.IO pattern
    console.log('Subscribing to pattern: socket.io#/#*');
    await subClient.psubscribe('socket.io#/#*');

    // Wait for subscription to be established
    await testUtils.delay(200);

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
    await testUtils.delay(500);

    // Check if we received the pattern message
    expect(receivedPatternMessages).toHaveLength(1);
    expect(receivedPatternMessages[0]?.pattern).toBe('socket.io#/#*');
    expect(receivedPatternMessages[0]?.channel).toBe('socket.io#/#general#');
    expect(receivedPatternMessages[0]?.message).toContain(
      'Hello from pattern test'
    );

    // Check if we received the buffer message
    expect(receivedBufferMessages).toHaveLength(1);
    expect(receivedBufferMessages[0]?.pattern).toBe('socket.io#/#*');
    expect(receivedBufferMessages[0]?.channel).toBe('socket.io#/#general#');

    console.log('✅ Pattern pub/sub test completed successfully');
  });
});
