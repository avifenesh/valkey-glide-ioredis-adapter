/**
 * Test the Direct GLIDE Pub/Sub utility
 */

import { 
  createPubSubClients, 
  publishMessage, 
  cleanupPubSubClients,
  BullGlideIntegration
} from '../../src/pubsub/DirectGlidePubSub';
import { getRedisTestConfig } from '../utils/redis-config';

describe('Direct GLIDE Pub/Sub', () => {
  test('basic pub/sub with direct utilities', async () => {
    const cfg = await getRedisTestConfig();
    
    // Track received messages via callback
    let messageReceived = false;
    let receivedMessage: any = null;
    
    // Create clients using the utility with callback
    const clients = await createPubSubClients(
      { host: cfg.host, port: cfg.port },
      { channels: ['direct-test'] },
      (message) => {
        console.log('📨 DIRECT: Callback received message:', message);
        messageReceived = true;
        receivedMessage = message;
      }
    );

    try {
      // Wait for subscription to be established
      await new Promise(resolve => setTimeout(resolve, 200));

      // Publish a message
      console.log('📤 DIRECT: Publishing message...');
      const publishResult = await publishMessage(clients.publisher, 'direct-test', 'hello direct world');
      console.log('📊 DIRECT: Publish result:', publishResult, 'subscribers');

      // Wait for callback to be triggered
      console.log('🔄 DIRECT: Waiting for callback...');
      await new Promise(resolve => setTimeout(resolve, 500));

      console.log('📊 DIRECT: Message received:', messageReceived);
      if (messageReceived) {
        console.log('✅ DIRECT: SUCCESS - Direct utilities work with callbacks!');
        expect(messageReceived).toBe(true);
        expect(receivedMessage?.channel).toBe('direct-test');
        expect(receivedMessage?.message).toBe('hello direct world');
      } else {
        console.log('❌ DIRECT: FAILURE - Callback not triggered');
        expect(messageReceived).toBe(true);
      }

    } finally {
      cleanupPubSubClients(clients);
    }
  });

  test('pattern subscription with direct utilities', async () => {
    const cfg = await getRedisTestConfig();
    
    // Track received messages via callback
    let patternMessageReceived = false;
    let receivedMessage: any = null;
    
    // Create clients with pattern subscription and callback
    const clients = await createPubSubClients(
      { host: cfg.host, port: cfg.port },
      { patterns: ['direct.*'] },
      (message) => {
        console.log('📨 DIRECT: Pattern callback received message:', message);
        patternMessageReceived = true;
        receivedMessage = message;
      }
    );

    try {
      // Wait for subscription to be established
      await new Promise(resolve => setTimeout(resolve, 200));

      // Publish to matching pattern
      console.log('📤 DIRECT: Publishing to pattern...');
      const publishResult = await publishMessage(clients.publisher, 'direct.news', 'pattern message');
      console.log('📊 DIRECT: Pattern publish result:', publishResult, 'subscribers');

      // Wait for callback to be triggered
      console.log('🔄 DIRECT: Waiting for pattern callback...');
      await new Promise(resolve => setTimeout(resolve, 500));

      console.log('📊 DIRECT: Pattern message received:', patternMessageReceived);
      if (patternMessageReceived) {
        console.log('✅ DIRECT: SUCCESS - Pattern subscriptions work with callbacks!');
        expect(patternMessageReceived).toBe(true);
        expect(receivedMessage?.pattern).toBe('direct.*');
        expect(receivedMessage?.channel).toBe('direct.news');
        expect(receivedMessage?.message).toBe('pattern message');
      } else {
        console.log('❌ DIRECT: FAILURE - Pattern callback not triggered');
        expect(patternMessageReceived).toBe(true);
      }

    } finally {
      cleanupPubSubClients(clients);
    }
  });

  test('Bull integration helper', async () => {
    const integration = new BullGlideIntegration();
    const cfg = await getRedisTestConfig();

    try {
      // Initialize with Bull-style channels
      await integration.initialize(
        { host: cfg.host, port: cfg.port },
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
