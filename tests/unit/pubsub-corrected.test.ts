/**
 * Corrected Pub/Sub Test - Understanding GLIDE's Architecture
 * 
 * This test demonstrates the correct way to use GLIDE's pub/sub system
 * based on our analysis of the architectural differences.
 */

import { GlideClient, GlideClientConfiguration } from '@valkey/valkey-glide';
import { testUtils } from '../setup';

describe('GLIDE Pub/Sub Architecture Understanding', () => {
  let config: any;

  beforeAll(async () => {
    const serversAvailable = await testUtils.checkTestServers();
    if (!serversAvailable) {
      throw new Error('Test servers not available');
    }
    config = await testUtils.getStandaloneConfig();
  });

  test('GLIDE pub/sub requires connection-time configuration', async () => {
    console.log('🔬 Testing GLIDE pub/sub architecture...');
    
    let messageReceived = false;
    let receivedChannel = '';
    let receivedMessage = '';
    
    // Create a GLIDE client configured for pub/sub at connection time
    const pubsubConfig: GlideClientConfiguration = {
      addresses: [{ host: config.host || 'localhost', port: config.port || 6379 }],
      ...(config.password && { 
        credentials: { password: config.password } 
      }),
      pubsubSubscriptions: {
        channelsAndPatterns: {
          [GlideClientConfiguration.PubSubChannelModes.Exact]: new Set(['test-channel'])
        },
                 callback: (msg, _context) => {
           console.log(`📨 GLIDE callback: ${msg.channel} -> ${msg.message}`);
           messageReceived = true;
           receivedChannel = String(msg.channel);
           receivedMessage = String(msg.message);
         },
        context: { test: 'context' }
      }
    };
    
    // Create the pub/sub client
    console.log('🔧 Creating GLIDE pub/sub client...');
    const pubsubClient = await GlideClient.createClient(pubsubConfig);
    
    // Create a separate client for publishing
    const publishConfig: GlideClientConfiguration = {
      addresses: [{ host: config.host || 'localhost', port: config.port || 6379 }],
      ...(config.password && { 
        credentials: { password: config.password } 
      }),
    };
    
    console.log('🔧 Creating GLIDE publish client...');
    const publishClient = await GlideClient.createClient(publishConfig);
    
    // Give clients time to establish connections
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Publish a message
    console.log('📤 Publishing message...');
    await publishClient.publish('test-channel', 'hello from glide');
    
    // Wait for message reception
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log(`📊 Message received: ${messageReceived}`);
    console.log(`📊 Received channel: ${receivedChannel}`);
    console.log(`📊 Received message: ${receivedMessage}`);
    
    // Clean up
    await pubsubClient.close();
    await publishClient.close();
    
    // This should work with GLIDE's proper architecture
    expect(messageReceived).toBe(true);
    expect(receivedChannel).toBe('test-channel');
    expect(receivedMessage).toBe('hello from glide');
  });

  test('GLIDE pattern subscriptions work with connection-time config', async () => {
    console.log('🔬 Testing GLIDE pattern subscriptions...');
    
    let patternMessageReceived = false;
    let receivedPattern = '';
    let receivedChannel = '';
    let receivedMessage = '';
    
    // Create a GLIDE client configured for pattern pub/sub
    const pubsubConfig: GlideClientConfiguration = {
      addresses: [{ host: config.host || 'localhost', port: config.port || 6379 }],
      ...(config.password && { 
        credentials: { password: config.password } 
      }),
      pubsubSubscriptions: {
        channelsAndPatterns: {
          [GlideClientConfiguration.PubSubChannelModes.Pattern]: new Set(['news.*'])
        },
        callback: (msg, _context) => {
          console.log(`📨 GLIDE pattern callback: ${msg.pattern} | ${msg.channel} -> ${msg.message}`);
          patternMessageReceived = true;
          receivedPattern = String(msg.pattern || '');
          receivedChannel = String(msg.channel);
          receivedMessage = String(msg.message);
        }
      }
    };
    
    const pubsubClient = await GlideClient.createClient(pubsubConfig);
    
    const publishConfig: GlideClientConfiguration = {
      addresses: [{ host: config.host || 'localhost', port: config.port || 6379 }],
      ...(config.password && { 
        credentials: { password: config.password } 
      }),
    };
    
    const publishClient = await GlideClient.createClient(publishConfig);
    
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Publish to a channel that matches the pattern
    console.log('📤 Publishing to news.breaking...');
    await publishClient.publish('news.breaking', 'important update');
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log(`📊 Pattern message received: ${patternMessageReceived}`);
    console.log(`📊 Pattern: ${receivedPattern}`);
    console.log(`📊 Channel: ${receivedChannel}`);
    console.log(`📊 Message: ${receivedMessage}`);
    
    await pubsubClient.close();
    await publishClient.close();
    
    expect(patternMessageReceived).toBe(true);
    expect(receivedChannel).toBe('news.breaking');
    expect(receivedMessage).toBe('important update');
  });
});
