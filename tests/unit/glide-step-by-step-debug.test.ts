/**
 * Step-by-step test to isolate exactly where the issue occurs
 */

import { EventEmitter } from 'events';
import { GlideClient, GlideClientConfiguration, PubSubMsg, ProtocolVersion } from '@valkey/valkey-glide';

describe('GLIDE Step-by-Step Debug', () => {
  let publishClient: GlideClient;
  let subscribeClient: GlideClient;

  afterAll(async () => {
    if (publishClient) {
      publishClient.close();
    }
    if (subscribeClient) {
      subscribeClient.close();
    }
  });

  test('step 1: exact replica of working test', async () => {
    // EXACT replica of working isolated test
    publishClient = await GlideClient.createClient({
      addresses: [{ host: 'localhost', port: 6379 }],
      protocol: ProtocolVersion.RESP3
    });

    const subscriptionConfig: GlideClientConfiguration = {
      addresses: [{ host: 'localhost', port: 6379 }],
      protocol: ProtocolVersion.RESP3,
      pubsubSubscriptions: {
        channelsAndPatterns: {
          [GlideClientConfiguration.PubSubChannelModes.Exact]: new Set(['step1-test'])
        }
      }
    };

    subscribeClient = await GlideClient.createClient(subscriptionConfig);

    console.log('🔧 STEP1: Clients created, waiting...');
    await new Promise(resolve => setTimeout(resolve, 200));

    console.log('📤 STEP1: Publishing message...');
    const publishResult = await publishClient.publish('hello step1', 'step1-test');
    console.log('📊 STEP1: Publish result:', publishResult, 'subscribers');

    console.log('🔄 STEP1: Polling for message (for-loop like working test)...');
    let messageReceived = false;
    let receivedMessage = '';
    let receivedChannel = '';

    for (let i = 0; i < 10; i++) {
      try {
        const message: PubSubMsg | null = await Promise.race([
          subscribeClient.getPubSubMessage(),
          new Promise<null>(resolve => setTimeout(() => resolve(null), 100))
        ]);

        if (message) {
          console.log('📨 STEP1: Got message:', message);
          messageReceived = true;
          receivedMessage = String(message.message);
          receivedChannel = String(message.channel);
          break;
        } else {
          console.log(`🔄 STEP1: Poll ${i + 1}/10 - no message`);
        }
      } catch (error) {
        console.log('❌ STEP1: Error polling:', error);
      }
    }

    console.log('📊 STEP1: Message received:', messageReceived);
    if (messageReceived) {
      console.log('✅ STEP1: SUCCESS - Exact replica works!');
      expect(messageReceived).toBe(true);
      expect(receivedChannel).toBe('step1-test');
      expect(receivedMessage).toBe('hello step1');
    } else {
      console.log('❌ STEP1: FAILURE - Even exact replica fails');
      expect(messageReceived).toBe(true);
    }
  });

  test('step 2: add EventEmitter but keep for-loop', async () => {
    // Clean up previous clients
    if (publishClient) publishClient.close();
    if (subscribeClient) subscribeClient.close();

    // Add EventEmitter but keep for-loop
    const eventEmitter = new EventEmitter();
    let eventEmitterReceived = false;

    eventEmitter.on('message', (channel: string, message: string) => {
      console.log('📨 STEP2: EventEmitter received:', { channel, message });
      eventEmitterReceived = true;
    });

    publishClient = await GlideClient.createClient({
      addresses: [{ host: 'localhost', port: 6379 }],
      protocol: ProtocolVersion.RESP3
    });

    const subscriptionConfig: GlideClientConfiguration = {
      addresses: [{ host: 'localhost', port: 6379 }],
      protocol: ProtocolVersion.RESP3,
      pubsubSubscriptions: {
        channelsAndPatterns: {
          [GlideClientConfiguration.PubSubChannelModes.Exact]: new Set(['step2-test'])
        }
      }
    };

    subscribeClient = await GlideClient.createClient(subscriptionConfig);

    console.log('🔧 STEP2: Clients created, waiting...');
    await new Promise(resolve => setTimeout(resolve, 200));

    console.log('📤 STEP2: Publishing message...');
    const publishResult = await publishClient.publish('hello step2', 'step2-test');
    console.log('📊 STEP2: Publish result:', publishResult, 'subscribers');

    console.log('🔄 STEP2: Polling with EventEmitter emission (for-loop)...');
    let directReceived = false;
    let directMessage = '';
    let directChannel = '';

    for (let i = 0; i < 10; i++) {
      try {
        const message: PubSubMsg | null = await Promise.race([
          subscribeClient.getPubSubMessage(),
          new Promise<null>(resolve => setTimeout(() => resolve(null), 100))
        ]);

        if (message) {
          console.log('📨 STEP2: Got message directly:', message);
          directReceived = true;
          directMessage = String(message.message);
          directChannel = String(message.channel);
          
          // Emit to EventEmitter
          eventEmitter.emit('message', directChannel, directMessage);
          break;
        } else {
          console.log(`🔄 STEP2: Poll ${i + 1}/10 - no message`);
        }
      } catch (error) {
        console.log('❌ STEP2: Error polling:', error);
      }
    }

    console.log('📊 STEP2: Direct received:', directReceived);
    console.log('📊 STEP2: EventEmitter received:', eventEmitterReceived);

    if (directReceived && eventEmitterReceived) {
      console.log('✅ STEP2: SUCCESS - EventEmitter + for-loop works!');
      expect(directReceived).toBe(true);
      expect(eventEmitterReceived).toBe(true);
    } else {
      console.log('❌ STEP2: FAILURE - EventEmitter + for-loop fails');
      console.log('🔍 STEP2: Direct:', directReceived, 'EventEmitter:', eventEmitterReceived);
      expect(directReceived && eventEmitterReceived).toBe(true);
    }
  });

  test('step 3: change to while-loop (like our bridge)', async () => {
    // Clean up previous clients
    if (publishClient) publishClient.close();
    if (subscribeClient) subscribeClient.close();

    // Use while-loop like our bridge does
    const eventEmitter = new EventEmitter();
    let eventEmitterReceived = false;

    eventEmitter.on('message', (channel: string, message: string) => {
      console.log('📨 STEP3: EventEmitter received:', { channel, message });
      eventEmitterReceived = true;
    });

    publishClient = await GlideClient.createClient({
      addresses: [{ host: 'localhost', port: 6379 }],
      protocol: ProtocolVersion.RESP3
    });

    const subscriptionConfig: GlideClientConfiguration = {
      addresses: [{ host: 'localhost', port: 6379 }],
      protocol: ProtocolVersion.RESP3,
      pubsubSubscriptions: {
        channelsAndPatterns: {
          [GlideClientConfiguration.PubSubChannelModes.Exact]: new Set(['step3-test'])
        }
      }
    };

    subscribeClient = await GlideClient.createClient(subscriptionConfig);

    console.log('🔧 STEP3: Clients created, waiting...');
    await new Promise(resolve => setTimeout(resolve, 200));

    // Start while-loop polling (like our bridge)
    console.log('🔄 STEP3: Starting while-loop polling...');
    let pollingActive = true;
    let pollCount = 0;
    let directReceived = false;

    const pollingPromise = (async () => {
      while (pollingActive && subscribeClient) {
        try {
          pollCount++;
          console.log(`🔄 STEP3: Poll iteration ${pollCount}`);

          const message: PubSubMsg | null = await Promise.race([
            subscribeClient.getPubSubMessage(),
            new Promise<null>(resolve => setTimeout(() => resolve(null), 100))
          ]);

          if (message) {
            console.log('📨 STEP3: Got message directly:', message);
            directReceived = true;
            const channel = String(message.channel);
            const messageContent = String(message.message);
            
            // Emit to EventEmitter
            eventEmitter.emit('message', channel, messageContent);
            break; // Stop after receiving message
          }
          
          // Limit polling iterations to avoid infinite loop
          if (pollCount >= 15) {
            console.log('🔄 STEP3: Reached max poll iterations, stopping');
            break;
          }
        } catch (error) {
          console.log('❌ STEP3: Polling error:', error);
          break;
        }
      }
      console.log('🔄 STEP3: Polling loop ended');
    })();

    // Wait a moment for polling to start
    await new Promise(resolve => setTimeout(resolve, 100));

    console.log('📤 STEP3: Publishing message...');
    const publishResult = await publishClient.publish('hello step3', 'step3-test');
    console.log('📊 STEP3: Publish result:', publishResult, 'subscribers');

    // Wait for message reception
    console.log('⏳ STEP3: Waiting for message reception...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Stop polling
    pollingActive = false;
    await pollingPromise;

    console.log('📊 STEP3: Direct received:', directReceived);
    console.log('📊 STEP3: EventEmitter received:', eventEmitterReceived);
    console.log('📊 STEP3: Poll count:', pollCount);

    if (directReceived && eventEmitterReceived) {
      console.log('✅ STEP3: SUCCESS - while-loop works too!');
      expect(directReceived).toBe(true);
      expect(eventEmitterReceived).toBe(true);
    } else {
      console.log('❌ STEP3: FAILURE - while-loop is the issue!');
      console.log('🔍 STEP3: Direct:', directReceived, 'EventEmitter:', eventEmitterReceived);
      
      // This will help us identify if while-loop is the problem
      expect(directReceived && eventEmitterReceived).toBe(true);
    }
  });
});
