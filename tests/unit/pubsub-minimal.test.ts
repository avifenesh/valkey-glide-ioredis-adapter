/**
 * Minimal GLIDE Pub/Sub Test
 * 
 * Testing the absolute minimal case to isolate the issue
 */

import { GlideClient, GlideClientConfiguration } from '@valkey/valkey-glide';
import { testUtils } from '../setup';

describe('Minimal GLIDE Pub/Sub', () => {
  let config: any;

  beforeAll(async () => {
    const serversAvailable = await testUtils.checkTestServers();
    if (!serversAvailable) {
      throw new Error('Test servers not available');
    }
    config = await testUtils.getStandaloneConfig();
  });

  test('minimal pub/sub with exact interface usage', async () => {
    console.log('🧪 Testing minimal GLIDE pub/sub...');
    
    let callbackInvoked = false;
    let receivedMessage = '';
    let receivedChannel = '';
    
    // Create pub/sub client with minimal configuration
    const pubsubConfig: GlideClientConfiguration = {
      addresses: [{ host: config.host || 'localhost', port: config.port || 6379 }],
      pubsubSubscriptions: {
        channelsAndPatterns: {
          [GlideClientConfiguration.PubSubChannelModes.Exact]: new Set(['minimal-test'])
        },
        callback: (msg, _context) => {
          console.log('🎯 Callback invoked!');
          console.log('📨 Message object:', JSON.stringify({
            channel: String(msg.channel),
            message: String(msg.message),
            pattern: msg.pattern ? String(msg.pattern) : null
          }));
          
          callbackInvoked = true;
          receivedChannel = String(msg.channel);
          receivedMessage = String(msg.message);
        }
      }
    };
    
    console.log('🔧 Creating pub/sub client...');
    const pubsubClient = await GlideClient.createClient(pubsubConfig);
    console.log('✅ Pub/sub client created');
    
    // Create publisher client
    const publisherConfig: GlideClientConfiguration = {
      addresses: [{ host: config.host || 'localhost', port: config.port || 6379 }]
    };
    
    console.log('🔧 Creating publisher client...');
    const publisherClient = await GlideClient.createClient(publisherConfig);
    console.log('✅ Publisher client created');
    
    // Wait for connections to establish
    console.log('⏳ Waiting for connections to establish...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Publish message
    console.log('📤 Publishing message...');
    const publishResult = await publisherClient.publish('minimal-test', 'test-payload');
    console.log(`📊 Publish result: ${publishResult} subscribers`);
    
    // Wait for message delivery
    console.log('⏳ Waiting for message delivery...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log(`📊 Callback invoked: ${callbackInvoked}`);
    console.log(`📊 Received channel: "${receivedChannel}"`);
    console.log(`📊 Received message: "${receivedMessage}"`);
    
    // Clean up
    console.log('🧹 Cleaning up...');
    await pubsubClient.close();
    await publisherClient.close();
    
    // Assertions
    expect(callbackInvoked).toBe(true);
    expect(receivedChannel).toBe('minimal-test');
    expect(receivedMessage).toBe('test-payload');
  });

  test('verify publish works independently', async () => {
    console.log('🧪 Testing publish functionality independently...');
    
    const client = await GlideClient.createClient({
      addresses: [{ host: config.host || 'localhost', port: config.port || 6379 }]
    });
    
    // This should work regardless of subscription
    const result = await client.publish('test-publish', 'test-message');
    console.log(`📊 Publish result: ${result} subscribers`);
    
    await client.close();
    
    // Should return 0 subscribers (no one listening)
    expect(typeof result).toBe('number');
  });
});
