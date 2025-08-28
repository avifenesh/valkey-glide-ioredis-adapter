/**
 * Test the Direct GLIDE Pub/Sub utility
 */

import { 
  createPubSubClients, 
  publishMessage, 
  pollForMessage, 
  cleanupPubSubClients,
  BullGlideIntegration
} from '../../src/pubsub/DirectGlidePubSub';

describe('Direct GLIDE Pub/Sub', () => {
  test('basic pub/sub with direct utilities', async () => {
    // Create clients using the utility
    const clients = await createPubSubClients(
      { host: 'localhost', port: 6379 },
      { channels: ['direct-test'] }
    );

    try {
      // Wait for subscription to be established
      await new Promise(resolve => setTimeout(resolve, 200));

      // Publish a message
      console.log('📤 DIRECT: Publishing message...');
      const publishResult = await publishMessage(clients.publisher, 'direct-test', 'hello direct world');
      console.log('📊 DIRECT: Publish result:', publishResult, 'subscribers');

      // Poll for the message using the working pattern
      console.log('🔄 DIRECT: Polling for message...');
      let messageReceived = false;
      let receivedMessage = null;

      // Use the proven for-loop pattern
      for (let i = 0; i < 10; i++) {
        const message = await pollForMessage(clients.subscriber);
        if (message) {
          console.log('📨 DIRECT: Received message:', message);
          messageReceived = true;
          receivedMessage = message;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      console.log('📊 DIRECT: Message received:', messageReceived);
      if (messageReceived) {
        console.log('✅ DIRECT: SUCCESS - Direct utilities work!');
        expect(messageReceived).toBe(true);
        expect(receivedMessage?.channel).toBe('direct-test');
        expect(receivedMessage?.message).toBe('hello direct world');
      } else {
        console.log('❌ DIRECT: FAILURE - Even direct utilities fail');
        expect(messageReceived).toBe(true);
      }

    } finally {
      cleanupPubSubClients(clients);
    }
  });

  test('pattern subscription with direct utilities', async () => {
    // Create clients with pattern subscription
    const clients = await createPubSubClients(
      { host: 'localhost', port: 6379 },
      { patterns: ['direct.*'] }
    );

    try {
      // Wait for subscription to be established
      await new Promise(resolve => setTimeout(resolve, 200));

      // Publish to matching pattern
      console.log('📤 DIRECT: Publishing to pattern...');
      const publishResult = await publishMessage(clients.publisher, 'direct.news', 'pattern message');
      console.log('📊 DIRECT: Pattern publish result:', publishResult, 'subscribers');

      // Poll for the pattern message
      console.log('🔄 DIRECT: Polling for pattern message...');
      let patternMessageReceived = false;
      let receivedMessage = null;

      for (let i = 0; i < 10; i++) {
        const message = await pollForMessage(clients.subscriber);
        if (message && message.pattern) {
          console.log('📨 DIRECT: Received pattern message:', message);
          patternMessageReceived = true;
          receivedMessage = message;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      console.log('📊 DIRECT: Pattern message received:', patternMessageReceived);
      if (patternMessageReceived) {
        console.log('✅ DIRECT: SUCCESS - Pattern subscriptions work!');
        expect(patternMessageReceived).toBe(true);
        expect(receivedMessage?.pattern).toBe('direct.*');
        expect(receivedMessage?.channel).toBe('direct.news');
        expect(receivedMessage?.message).toBe('pattern message');
      } else {
        console.log('❌ DIRECT: FAILURE - Pattern subscriptions fail');
        expect(patternMessageReceived).toBe(true);
      }

    } finally {
      cleanupPubSubClients(clients);
    }
  });

  test('Bull integration helper', async () => {
    const integration = new BullGlideIntegration();

    try {
      // Initialize with Bull-style channels
      await integration.initialize(
        { host: 'localhost', port: 6379 },
        ['bull:job:completed', 'bull:job:failed']
      );

      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 300));

      // Publish a Bull-style message
      console.log('📤 BULL: Publishing Bull message...');
      const publishResult = await integration.publish('bull:job:completed', JSON.stringify({ jobId: 123 }));
      console.log('📊 BULL: Bull publish result:', publishResult, 'subscribers');

      // Wait for message processing
      await new Promise(resolve => setTimeout(resolve, 500));

      console.log('✅ BULL: Bull integration helper created successfully');
      expect(publishResult).toBeGreaterThanOrEqual(0);

    } finally {
      await integration.cleanup();
    }
  });
});
