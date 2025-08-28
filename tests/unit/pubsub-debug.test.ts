/**
 * Debug test to understand pub/sub message reception issues
 */

import { RedisAdapter } from '../../src/adapters/RedisAdapter';
import { PubSubMessageHandler } from '../../src/adapters/PubSubMessageHandler';
import { testUtils } from '../setup';

describe('Pub/Sub Debug', () => {
  let config: any;

  beforeAll(async () => {
    const serversAvailable = await testUtils.checkTestServers();
    if (!serversAvailable) {
      throw new Error('Test servers not available');
    }
    config = await testUtils.getStandaloneConfig();
  });

  test('PubSubMessageHandler works independently', async () => {
    const redis = new RedisAdapter(config);
    await redis.connect();
    
    let messageReceived = false;
    let receivedChannel = '';
    let receivedMessage = '';

    // Test the message handler directly
    const messageHandler = new PubSubMessageHandler(
      {
        addresses: [{ host: config.host || 'localhost', port: config.port || 6379 }],
        ...(config.password && { 
          credentials: { password: config.password } 
        }),
      },
      redis // Pass the redis adapter as event emitter
    );

    // Listen for messages
    redis.on('message', (channel, message) => {
      console.log(`📨 Message received: ${channel} -> ${message}`);
      messageReceived = true;
      receivedChannel = channel;
      receivedMessage = message;
    });

    // Create message client for a channel
    console.log('🔧 Creating message client for test-debug-channel...');
    await messageHandler.createMessageClient('test-debug-channel');
    
    // Give it time to establish
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Publish a message
    console.log('📤 Publishing message...');
    await redis.publish('test-debug-channel', 'debug-message');
    
    // Wait for message
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log(`📊 Message received: ${messageReceived}`);
    console.log(`📊 Handler status:`, messageHandler.getStatus());
    
    if (messageReceived) {
      expect(receivedChannel).toBe('test-debug-channel');
      expect(receivedMessage).toBe('debug-message');
    }
    
    // Clean up
    await messageHandler.cleanup();
    await redis.disconnect();
    
    // This test helps us understand if the message handler works at all
    expect(messageReceived).toBe(true); // We expect this to work now
  });

  test('understand GLIDE pub/sub behavior', async () => {
    console.log('🔍 Testing GLIDE pub/sub behavior directly...');
    
    // This test helps us understand how GLIDE pub/sub actually works
    const redis1 = new RedisAdapter(config);
    const redis2 = new RedisAdapter(config);
    
    await redis1.connect();
    await redis2.connect();
    
    // Test current implementation
    let subscribeEventReceived = false;
    let messageReceived = false;
    
    redis1.on('subscribe', (channel, count) => {
      console.log(`📋 Subscribe event: ${channel}, count: ${count}`);
      subscribeEventReceived = true;
    });
    
    redis1.on('message', (channel, message) => {
      console.log(`📨 Message event: ${channel} -> ${message}`);
      messageReceived = true;
    });
    
    console.log('🔧 Subscribing to test-channel...');
    await redis1.subscribe('test-channel');
    
    await new Promise(resolve => setTimeout(resolve, 200));
    
    console.log('📤 Publishing message from second client...');
    await redis2.publish('test-channel', 'test-message');
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log(`📊 Subscribe event received: ${subscribeEventReceived}`);
    console.log(`📊 Message received: ${messageReceived}`);
    
    await redis1.disconnect();
    await redis2.disconnect();
    
    expect(subscribeEventReceived).toBe(true);
    // We'll see if message is received with our new implementation
  });
});
