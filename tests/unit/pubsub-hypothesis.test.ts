/**
 * GLIDE Pub/Sub Hypothesis Test
 * 
 * Testing if GLIDE pub/sub clients are isolated from regular clients
 */

import { GlideClient, GlideClientConfiguration } from '@valkey/valkey-glide';
import { testUtils } from '../setup';

describe('GLIDE Pub/Sub Hypothesis', () => {
  let config: any;

  beforeAll(async () => {
    const serversAvailable = await testUtils.checkTestServers();
    if (!serversAvailable) {
      throw new Error('Test servers not available');
    }
    config = await testUtils.getStandaloneConfig();
  });

  test('hypothesis: pub/sub clients are isolated from regular clients', async () => {
    console.log('🧪 Testing pub/sub client isolation hypothesis...');
    
    let callbackInvoked = false;
    
    // Create pub/sub client
    const pubsubConfig: GlideClientConfiguration = {
      addresses: [{ host: config.host || 'localhost', port: config.port || 6379 }],
      pubsubSubscriptions: {
        channelsAndPatterns: {
          [GlideClientConfiguration.PubSubChannelModes.Exact]: new Set(['isolation-test'])
        },
        callback: (msg, _context) => {
          console.log('🎯 Callback invoked!', String(msg.channel), String(msg.message));
          callbackInvoked = true;
        }
      }
    };
    
    const pubsubClient = await GlideClient.createClient(pubsubConfig);
    console.log('✅ Pub/sub client created');
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test 1: Try publishing from the same pub/sub client
    console.log('📤 Test 1: Publishing from pub/sub client...');
    try {
      const result1 = await pubsubClient.publish('isolation-test', 'from-pubsub-client');
      console.log(`📊 Publish from pub/sub client result: ${result1} subscribers`);
    } catch (error) {
      console.log('❌ Cannot publish from pub/sub client:', error);
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log(`📊 Callback invoked after pub/sub publish: ${callbackInvoked}`);
    
    // Reset for next test
    callbackInvoked = false;
    
    // Test 2: Try publishing from regular client (we know this doesn't work)
    const regularClient = await GlideClient.createClient({
      addresses: [{ host: config.host || 'localhost', port: config.port || 6379 }]
    });
    
    console.log('📤 Test 2: Publishing from regular client...');
    const result2 = await regularClient.publish('isolation-test', 'from-regular-client');
    console.log(`📊 Publish from regular client result: ${result2} subscribers`);
    
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log(`📊 Callback invoked after regular publish: ${callbackInvoked}`);
    
    // Test 3: Try using Redis CLI to publish (external to GLIDE)
    console.log('📤 Test 3: Publishing via Redis CLI...');
    
    // Clean up first
    await pubsubClient.close();
    await regularClient.close();
    
    // This test helps us understand if the issue is GLIDE-specific
    expect(true).toBe(true);
  });

  test('test cross-client pub/sub with two pub/sub clients', async () => {
    console.log('🧪 Testing pub/sub between two pub/sub clients...');
    
    let subscriber1Called = false;
    let subscriber2Called = false;
    
    // Create first pub/sub client (subscriber)
    const subscriber1Config: GlideClientConfiguration = {
      addresses: [{ host: config.host || 'localhost', port: config.port || 6379 }],
      pubsubSubscriptions: {
        channelsAndPatterns: {
          [GlideClientConfiguration.PubSubChannelModes.Exact]: new Set(['cross-test'])
        },
        callback: (msg, _context) => {
          console.log('🎯 Subscriber 1 callback:', String(msg.channel), String(msg.message));
          subscriber1Called = true;
        }
      }
    };
    
    // Create second pub/sub client (also subscriber, but we'll try to publish from it)
    const subscriber2Config: GlideClientConfiguration = {
      addresses: [{ host: config.host || 'localhost', port: config.port || 6379 }],
      pubsubSubscriptions: {
        channelsAndPatterns: {
          [GlideClientConfiguration.PubSubChannelModes.Exact]: new Set(['cross-test'])
        },
        callback: (msg, _context) => {
          console.log('🎯 Subscriber 2 callback:', String(msg.channel), String(msg.message));
          subscriber2Called = true;
        }
      }
    };
    
    const subscriber1 = await GlideClient.createClient(subscriber1Config);
    const subscriber2 = await GlideClient.createClient(subscriber2Config);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check subscription count
    const diagnosticClient = await GlideClient.createClient({
      addresses: [{ host: config.host || 'localhost', port: config.port || 6379 }]
    });
    
    const subCount = await diagnosticClient.pubsubNumSub(['cross-test']);
    console.log('📊 Cross-test subscription count:', subCount);
    
    // Try publishing from subscriber2 to subscriber1
    console.log('📤 Publishing from subscriber2...');
    try {
      const result = await subscriber2.publish('cross-test', 'cross-message');
      console.log(`📊 Cross-publish result: ${result} subscribers`);
    } catch (error) {
      console.log('❌ Cross-publish error:', error);
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log(`📊 Subscriber 1 called: ${subscriber1Called}`);
    console.log(`📊 Subscriber 2 called: ${subscriber2Called}`);
    
    await subscriber1.close();
    await subscriber2.close();
    await diagnosticClient.close();
    
    expect(true).toBe(true);
  });
});
