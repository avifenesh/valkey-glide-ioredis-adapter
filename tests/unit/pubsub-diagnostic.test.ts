/**
 * GLIDE Pub/Sub Diagnostic Test
 * 
 * Investigating why pubsubSubscriptions configuration is not working
 */

import { GlideClient, GlideClientConfiguration } from '@valkey/valkey-glide';
import { testUtils } from '../setup';

describe('GLIDE Pub/Sub Diagnostics', () => {
  let config: any;

  beforeAll(async () => {
    const serversAvailable = await testUtils.checkTestServers();
    if (!serversAvailable) {
      throw new Error('Test servers not available');
    }
    config = await testUtils.getStandaloneConfig();
  });

  test('diagnose subscription establishment', async () => {
    console.log('🔍 Diagnosing GLIDE pub/sub subscription establishment...');
    
    let callbackInvoked = false;
    
    // Create pub/sub client
    const pubsubConfig: GlideClientConfiguration = {
      addresses: [{ host: config.host || 'localhost', port: config.port || 6379 }],
      pubsubSubscriptions: {
        channelsAndPatterns: {
          [GlideClientConfiguration.PubSubChannelModes.Exact]: new Set(['diagnostic-channel'])
        },
        callback: (msg, _context) => {
          console.log('🎯 Callback invoked!', String(msg.channel), String(msg.message));
          callbackInvoked = true;
        }
      }
    };
    
    console.log('🔧 Creating pub/sub client...');
    const pubsubClient = await GlideClient.createClient(pubsubConfig);
    console.log('✅ Pub/sub client created');
    
    // Create diagnostic client to check subscriptions
    const diagnosticClient = await GlideClient.createClient({
      addresses: [{ host: config.host || 'localhost', port: config.port || 6379 }]
    });
    
    // Wait for connection establishment
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check active channels
    console.log('🔍 Checking active pub/sub channels...');
    const activeChannels = await diagnosticClient.pubsubChannels();
    console.log('📊 Active channels:', activeChannels.map(c => String(c)));
    
    // Check subscription count for our channel
    console.log('🔍 Checking subscription count for diagnostic-channel...');
    const subCount = await diagnosticClient.pubsubNumSub(['diagnostic-channel']);
    console.log('📊 Subscription count:', subCount);
    
    // Try publishing
    console.log('📤 Publishing to diagnostic-channel...');
    const publishResult = await diagnosticClient.publish('diagnostic-channel', 'diagnostic-message');
    console.log(`📊 Publish result: ${publishResult} subscribers`);
    
    // Wait for potential message
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log(`📊 Callback invoked: ${callbackInvoked}`);
    
    // Clean up
    await pubsubClient.close();
    await diagnosticClient.close();
    
    // Report findings
    console.log('\n📋 DIAGNOSTIC SUMMARY:');
    console.log(`- Active channels: ${activeChannels.length}`);
    console.log(`- Subscription count: ${JSON.stringify(subCount)}`);
    console.log(`- Publish result: ${publishResult} subscribers`);
    console.log(`- Callback invoked: ${callbackInvoked}`);
    
    // This test is for diagnosis, not assertion
    expect(true).toBe(true);
  });

  test('test manual subscription with customCommand', async () => {
    console.log('🧪 Testing manual subscription with customCommand...');
    
    // Create regular client and try manual subscription
    const client = await GlideClient.createClient({
      addresses: [{ host: config.host || 'localhost', port: config.port || 6379 }]
    });
    
    try {
      console.log('📤 Attempting manual SUBSCRIBE via customCommand...');
      const subscribeResult = await client.customCommand(['SUBSCRIBE', 'manual-test']);
      console.log('📊 Manual subscribe result:', subscribeResult);
    } catch (error) {
      console.log('❌ Manual subscribe error:', error);
    }
    
    // Check if subscription was established
    const diagnosticClient = await GlideClient.createClient({
      addresses: [{ host: config.host || 'localhost', port: config.port || 6379 }]
    });
    
    const subCount = await diagnosticClient.pubsubNumSub(['manual-test']);
    console.log('📊 Manual subscription count:', subCount);
    
    await client.close();
    await diagnosticClient.close();
    
    expect(true).toBe(true);
  });

  test('compare with Redis CLI behavior', async () => {
    console.log('🧪 Understanding expected Redis behavior...');
    
    const client = await GlideClient.createClient({
      addresses: [{ host: config.host || 'localhost', port: config.port || 6379 }]
    });
    
    // Check what Redis reports before any subscriptions
    const initialChannels = await client.pubsubChannels();
    console.log('📊 Initial active channels:', initialChannels.map(c => String(c)));
    
    const initialCount = await client.pubsubNumSub(['test-channel']);
    console.log('📊 Initial subscription count for test-channel:', initialCount);
    
    await client.close();
    
    expect(true).toBe(true);
  });
});
