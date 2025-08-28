/**
 * Hybrid Pub/Sub Bridge Test
 * 
 * Validates that our hybrid approach (native ioredis for pub/sub) works correctly
 */

import { HybridPubSubBridge } from '../../src/adapters/HybridPubSubBridge';
import { testUtils } from '../setup';

describe('Hybrid Pub/Sub Bridge', () => {
  let config: any;

  beforeAll(async () => {
    const serversAvailable = await testUtils.checkTestServers();
    if (!serversAvailable) {
      throw new Error('Test servers not available');
    }
    config = await testUtils.getStandaloneConfig();
  });

  test('hybrid bridge basic pub/sub functionality', async () => {
    console.log('🧪 Testing hybrid pub/sub bridge...');
    
    const bridge = new HybridPubSubBridge(config);
    
    let messageReceived = false;
    let receivedChannel = '';
    let receivedMessage = '';
    
    // Set up message listener
    bridge.on('message', (channel, message) => {
      console.log(`📨 Message received: ${channel} -> ${message}`);
      messageReceived = true;
      receivedChannel = channel;
      receivedMessage = message;
    });
    
    // Subscribe to a channel
    console.log('🔧 Subscribing to hybrid-test...');
    const subResult = await bridge.subscribe('hybrid-test');
    expect(subResult).toBe(1);
    
    // Give subscription time to establish
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Publish a message
    console.log('📤 Publishing message...');
    const pubResult = await bridge.publish('hybrid-test', 'hello hybrid world');
    console.log(`📊 Publish result: ${pubResult} subscribers`);
    
    // Wait for message delivery
    await new Promise(resolve => setTimeout(resolve, 200));
    
    console.log(`📊 Message received: ${messageReceived}`);
    console.log(`📊 Received channel: "${receivedChannel}"`);
    console.log(`📊 Received message: "${receivedMessage}"`);
    
    // Validate results
    expect(messageReceived).toBe(true);
    expect(receivedChannel).toBe('hybrid-test');
    expect(receivedMessage).toBe('hello hybrid world');
    expect(pubResult).toBe(1); // Should report 1 subscriber
    
    // Clean up
    await bridge.cleanup();
  });

  test('hybrid bridge pattern subscriptions', async () => {
    console.log('🧪 Testing hybrid pattern subscriptions...');
    
    const bridge = new HybridPubSubBridge(config);
    
    let patternMessageReceived = false;
    let receivedPattern = '';
    let receivedChannel = '';
    let receivedMessage = '';
    
    // Set up pattern message listener
    bridge.on('pmessage', (pattern, channel, message) => {
      console.log(`📨 Pattern message: ${pattern} | ${channel} -> ${message}`);
      patternMessageReceived = true;
      receivedPattern = pattern;
      receivedChannel = channel;
      receivedMessage = message;
    });
    
    // Subscribe to a pattern
    console.log('🔧 Subscribing to pattern hybrid.*...');
    const subResult = await bridge.psubscribe('hybrid.*');
    expect(subResult).toBe(1);
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Publish to a matching channel
    console.log('📤 Publishing to hybrid.news...');
    const pubResult = await bridge.publish('hybrid.news', 'pattern test message');
    console.log(`📊 Pattern publish result: ${pubResult} subscribers`);
    
    await new Promise(resolve => setTimeout(resolve, 200));
    
    console.log(`📊 Pattern message received: ${patternMessageReceived}`);
    console.log(`📊 Pattern: "${receivedPattern}"`);
    console.log(`📊 Channel: "${receivedChannel}"`);
    console.log(`📊 Message: "${receivedMessage}"`);
    
    // Validate results
    expect(patternMessageReceived).toBe(true);
    expect(receivedPattern).toBe('hybrid.*');
    expect(receivedChannel).toBe('hybrid.news');
    expect(receivedMessage).toBe('pattern test message');
    expect(pubResult).toBe(1);
    
    await bridge.cleanup();
  });

  test('hybrid bridge subscription events', async () => {
    console.log('🧪 Testing hybrid subscription events...');
    
    const bridge = new HybridPubSubBridge(config);
    
    let subscribeEventReceived = false;
    let unsubscribeEventReceived = false;
    
    bridge.on('subscribe', (channel, count) => {
      console.log(`📋 Subscribe event: ${channel}, count: ${count}`);
      subscribeEventReceived = true;
      expect(channel).toBe('event-test');
      expect(count).toBe(1);
    });
    
    bridge.on('unsubscribe', (channel, count) => {
      console.log(`📋 Unsubscribe event: ${channel}, count: ${count}`);
      unsubscribeEventReceived = true;
      expect(channel).toBe('event-test');
      expect(count).toBe(0);
    });
    
    // Subscribe and unsubscribe
    await bridge.subscribe('event-test');
    await new Promise(resolve => setTimeout(resolve, 50));
    
    await bridge.unsubscribe('event-test');
    await new Promise(resolve => setTimeout(resolve, 50));
    
    expect(subscribeEventReceived).toBe(true);
    expect(unsubscribeEventReceived).toBe(true);
    
    await bridge.cleanup();
  });

  test('hybrid bridge status and cleanup', async () => {
    console.log('🧪 Testing hybrid bridge status and cleanup...');
    
    const bridge = new HybridPubSubBridge(config);
    
    // Initial status
    let status = bridge.getStatus();
    expect(status.subscribedChannels).toEqual([]);
    expect(status.subscribedPatterns).toEqual([]);
    expect(status.isInSubscriberMode).toBe(false);
    
    // Subscribe to channels and patterns
    await bridge.subscribe('status-test-1', 'status-test-2');
    await bridge.psubscribe('status.*');
    
    // Check status after subscriptions
    status = bridge.getStatus();
    expect(status.subscribedChannels).toEqual(['status-test-1', 'status-test-2']);
    expect(status.subscribedPatterns).toEqual(['status.*']);
    expect(status.isInSubscriberMode).toBe(true);
    expect(status.hasSubscriber).toBe(true);
    expect(status.hasPublisher).toBe(true);
    
    // Clean up and check final status
    await bridge.cleanup();
    
    status = bridge.getStatus();
    expect(status.subscribedChannels).toEqual([]);
    expect(status.subscribedPatterns).toEqual([]);
    expect(status.isInSubscriberMode).toBe(false);
    expect(status.hasSubscriber).toBe(false);
    expect(status.hasPublisher).toBe(false);
  });
});
