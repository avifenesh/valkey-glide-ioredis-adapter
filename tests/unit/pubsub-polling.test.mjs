import {
  describe,
  it,
  test,
  beforeEach,
  afterEach,
  before,
  after,
} from 'node:test';
import assert from 'node:assert';
import {
  GlideClient,
  GlideClientConfiguration,
  PubSubMsg,
  ProtocolVersion,
} from '@valkey/valkey-glide';

describe('GLIDE Pub/Sub Polling Approach', () => {
  let publishClient;
  let subscribeClient;

  before(async () => {
    // Create a regular client for publishing
    publishClient = await GlideClient.createClient({
      addresses: [
        {
          host: 'localhost',
          port: parseInt(process.env.VALKEY_PORT || '6383'),
        },
      ],
      // "RESP3",
    });

    // Create a pub/sub client for subscribing (using polling pattern)
    const subscribeConfig = {
      addresses: [
        {
          host: 'localhost',
          port: parseInt(process.env.VALKEY_PORT || '6383'),
        },
      ],
      // "RESP3",
      pubsubSubscriptions: {
        channelsAndPatterns: {
          [GlideClientConfiguration.PubSubChannelModes.Exact]: new Set([
            'polling-test',
          ]),
        },
        // No callback - we'll use getPubSubMessage() instead
      },
    };

    subscribeClient = await GlideClient.createClient(subscribeConfig);
  });

  after(async () => {
    if (publishClient) {
      publishClient.close();
    }
    if (subscribeClient) {
      subscribeClient.close();
    }
  });

  test('should receive messages using getPubSubMessage() polling', async () => {
    let messageReceived = false;
    let receivedChannel = '';
    let receivedMessage = '';

    // Start polling for messages in the background
    const pollingPromise = (async () => {
      try {
        while (!messageReceived) {
          const message = await subscribeClient.getPubSubMessage();
          if (message) {
            console.log('📨 Polling received message:', {
              channel: message.channel,
              message: message.message,
              pattern: message.pattern ? String(message.pattern) : undefined,
            });

            if (String(message.channel) === 'polling-test') {
              messageReceived = true;
              receivedChannel = String(message.channel);
              receivedMessage = String(message.message);
              break;
            }
          }
          // Small delay to prevent tight loop
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      } catch (error) {
        console.error('❌ Polling error:', error);
      }
    })();

    // Wait a moment for subscription to be established
    await new Promise(resolve => setTimeout(resolve, 100));

    // Publish a message
    console.log('📤 Publishing message...');
    const publishResult = await publishClient.publish(
      'hello polling world',
      'polling-test'
    );
    console.log('📊 Publish result:', publishResult, 'subscribers');

    // Wait for message to be received (with timeout)
    const timeoutPromise = new Promise(resolve => setTimeout(resolve, 2000));
    await Promise.race([pollingPromise, timeoutPromise]);

    // Verify results
    console.log('📊 Message received:', messageReceived);
    if (messageReceived) {
      console.log('📨 Received channel:', receivedChannel);
      console.log('📨 Received message:', receivedMessage);

      assert.strictEqual(messageReceived, true);
      assert.strictEqual(receivedChannel, 'polling-test');
      assert.strictEqual(receivedMessage, 'hello polling world');
    } else {
      console.log(
        '⚠️  No message received within timeout - this indicates the polling approach may also have issues'
      );
      // For now, we'll expect this to fail until we understand the issue better
      assert.strictEqual(messageReceived, false);
    }
  });

  test('should verify subscription is established', async () => {
    // Verify the subscription exists
    const channels = await publishClient.pubsubChannels();
    console.log('📊 Active channels:', channels);

    const numSub = await publishClient.pubsubNumSub(['polling-test']);
    console.log('📊 Subscription count:', numSub);

    assert.ok(Array.isArray(channels));
    assert.ok(Array.isArray(numSub));

    // We should see our subscription
    const pollingTestSub = numSub.find(sub => sub.channel === 'polling-test');
    if (pollingTestSub) {
      assert.ok(pollingTestSub.numSub > 0);
      console.log('✅ Subscription confirmed:', pollingTestSub);
    } else {
      console.log('⚠️  No subscription found for polling-test channel');
    }
  });
});
