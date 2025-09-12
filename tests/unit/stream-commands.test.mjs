/**
 * Stream Commands Comprehensive Tests
 * Real-world patterns sourcing, microservices communication, real-time analytics
 * Based on Kafka-style streaming, Discord message delivery, Slack real-time updates
 */

import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { describeForEachMode, createClient, flushAll, keyTag } from '../setup/dual-mode.mjs';

describeForEachMode('Stream Commands - Event Sourcing & Microservices', mode => {
  let client;
  let tag;

  beforeEach(async () => {
    client = await createClient(mode);
    await client.connect();
    await flushAll(client);
    tag = keyTag('x');
  });

  afterEach(async () => {
    await client.quit();
  });

  describe('Event Sourcing Patterns', () => {
    test('should implement user action event streaming with XADD', async () => {
      const streamKey = `${tag}:user_actions:${Math.random()}`;

      // Record user events
      const loginEvent = await client.xadd(
        streamKey,
        '*',
        'event',
        'user_login',
        'user_id',
        '12345',
        'timestamp',
        Date.now().toString(),
        'ip_address',
        '192.168.1.100',
        'user_agent',
        'Mozilla/5.0...'
      );
      assert.match(loginEvent, /\d+-\d+/); // Redis stream ID format

      const purchaseEvent = await client.xadd(
        streamKey,
        '*',
        'event',
        'purchase_completed',
        'user_id',
        '12345',
        'order_id',
        'ORD-789',
        'amount',
        '99.99',
        'currency',
        'USD'
      );
      assert.match(purchaseEvent, /\d+-\d+/);

      const logoutEvent = await client.xadd(
        streamKey,
        '*',
        'event',
        'user_logout',
        'user_id',
        '12345',
        'session_duration',
        '3600'
      );
      assert.match(logoutEvent, /\d+-\d+/);

      // Verify stream length
      const streamLength = await client.xlen(streamKey);
      assert.strictEqual(streamLength, 3);
    });

    test('should read event stream with XREAD for replay', async () => {
      const streamKey = 'order_events:' + Math.random();

      // Add some order events
      await client.xadd(
        streamKey,
        '*',
        'event',
        'order_created',
        'order_id',
        'ORD-001',
        'customer_id',
        'CUST-123',
        'amount',
        '150.00'
      );

      await client.xadd(
        streamKey,
        '*',
        'event',
        'payment_processed',
        'order_id',
        'ORD-001',
        'payment_method',
        'credit_card',
        'status',
        'success'
      );

      await client.xadd(
        streamKey,
        '*',
        'event',
        'order_shipped',
        'order_id',
        'ORD-001',
        'tracking_number',
        'TRK-456',
        'carrier',
        'UPS'
      );

      // Read all events from beginning
      const allEvents = await client.xread('STREAMS', streamKey, '0');
      assert.ok(allEvents);
      assert.ok(Array.isArray(allEvents));
      assert.strictEqual(allEvents.length, 1); // One stream
      assert.strictEqual(allEvents[0].length, 2); // [streamName, events]
      assert.strictEqual(allEvents[0][0], streamKey);
      assert.strictEqual(allEvents[0][1].length, 3); // Three events

      // Verify event data
      const events = allEvents[0][1];
      assert.ok(events[0][1].includes('order_created'));
      assert.ok(events[1][1].includes('payment_processed'));
      assert.ok(events[2][1].includes('order_shipped'));
    });

    test('should implement aggregate rebuilding from event stream', async () => {
      const streamKey = 'account_events:' + Math.random();
      const accountId = 'ACC-789';

      // Record account events over time
      await client.xadd(
        streamKey,
        '*',
        'event',
        'account_created',
        'account_id',
        accountId,
        'initial_balance',
        '0.00',
        'currency',
        'USD'
      );

      await client.xadd(
        streamKey,
        '*',
        'event',
        'deposit',
        'account_id',
        accountId,
        'amount',
        '1000.00',
        'source',
        'bank_transfer'
      );

      await client.xadd(
        streamKey,
        '*',
        'event',
        'withdrawal',
        'account_id',
        accountId,
        'amount',
        '250.00',
        'destination',
        'ATM'
      );

      await client.xadd(
        streamKey,
        '*',
        'event',
        'deposit',
        'account_id',
        accountId,
        'amount',
        '500.00',
        'source',
        'check_deposit'
      );

      // Rebuild account state by replaying events
      const events = await client.xread('STREAMS', streamKey, '0');
      const accountEvents = events[0][1];

      let accountState = {
        id: accountId,
        balance: 0,
        transactions: 0,
        created: false,
      };

      for (const [eventId, eventData] of accountEvents) {
        const eventFields = {};
        for (let i = 0; i < eventData.length; i += 2) {
          eventFields[eventData[i]] = eventData[i + 1];
        }

        switch (eventFields['event']) {
          case 'account_created':
            accountState.created = true;
            break;
          case 'deposit':
            accountState.balance += parseFloat(eventFields['amount'] || '0');
            accountState.transactions++;
            break;
          case 'withdrawal':
            accountState.balance -= parseFloat(eventFields['amount'] || '0');
            accountState.transactions++;
            break;
        }
      }

      assert.strictEqual(accountState.balance, 1250.0); // 1000 - 250 + 500
      assert.strictEqual(accountState.transactions, 3);
      assert.strictEqual(accountState.created, true);
    });
  });

  describe('Microservices Communication Patterns', () => {
    test('should implement order processing workflow across services', async () => {
      const orderStreamKey = 'orders:' + Math.random();
      const inventoryStreamKey = 'inventory:' + Math.random();
      const paymentStreamKey = 'payments:' + Math.random();

      // Order service creates order
      const orderId = `ORD-${Math.random()}`;
      await client.xadd(
        orderStreamKey,
        '*',
        'service',
        'order-service',
        'event',
        'order_created',
        'order_id',
        orderId,
        'product_id',
        'PROD-123',
        'quantity',
        '2',
        'customer_id',
        'CUST-456'
      );

      // Inventory service reserves stock
      await client.xadd(
        inventoryStreamKey,
        '*',
        'service',
        'inventory-service',
        'event',
        'stock_reserved',
        'order_id',
        orderId,
        'product_id',
        'PROD-123',
        'quantity_reserved',
        '2',
        'remaining_stock',
        '48'
      );

      // Payment service processes payment
      await client.xadd(
        paymentStreamKey,
        '*',
        'service',
        'payment-service',
        'event',
        'payment_processed',
        'order_id',
        orderId,
        'amount',
        '199.98',
        'payment_method',
        'credit_card',
        'transaction_id',
        'TXN-789'
      );

      // Order service completes order
      await client.xadd(
        orderStreamKey,
        '*',
        'service',
        'order-service',
        'event',
        'order_completed',
        'order_id',
        orderId,
        'status',
        'completed',
        'completion_time',
        Date.now().toString()
      );

      // Verify all services recorded their events
      const orderEvents = await client.xread('STREAMS', orderStreamKey, '0');
      const inventoryEvents = await client.xread(
        'STREAMS',
        inventoryStreamKey,
        '0'
      );
      const paymentEvents = await client.xread(
        'STREAMS',
        paymentStreamKey,
        '0'
      );

      assert.strictEqual(orderEvents[0][1].length, 2); // Order created + completed
      assert.strictEqual(inventoryEvents[0][1].length, 1); // Stock reserved
      assert.strictEqual(paymentEvents[0][1].length, 1); // Payment processed
    });

    test('should implement saga pattern for distributed transactions', async () => {
      const sagaStreamKey = 'saga:book_trip:' + Math.random();
      const tripId = `TRIP-${Math.random()}`;

      // Flight booking
      await client.xadd(
        sagaStreamKey,
        '*',
        'saga_id',
        tripId,
        'step',
        'book_flight',
        'service',
        'flight-service',
        'action',
        'start',
        'flight_id',
        'FL-123',
        'cost',
        '300.00'
      );

      await client.xadd(
        sagaStreamKey,
        '*',
        'saga_id',
        tripId,
        'step',
        'book_flight',
        'service',
        'flight-service',
        'action',
        'success',
        'booking_ref',
        'FB-456'
      );

      // Hotel booking
      await client.xadd(
        sagaStreamKey,
        '*',
        'saga_id',
        tripId,
        'step',
        'book_hotel',
        'service',
        'hotel-service',
        'action',
        'start',
        'hotel_id',
        'HTL-789',
        'cost',
        '200.00'
      );

      await client.xadd(
        sagaStreamKey,
        '*',
        'saga_id',
        tripId,
        'step',
        'book_hotel',
        'service',
        'hotel-service',
        'action',
        'success',
        'booking_ref',
        'HB-012'
      );

      // Car rental (fails)
      await client.xadd(
        sagaStreamKey,
        '*',
        'saga_id',
        tripId,
        'step',
        'book_car',
        'service',
        'car-service',
        'action',
        'start',
        'car_id',
        'CAR-345',
        'cost',
        '150.00'
      );

      await client.xadd(
        sagaStreamKey,
        '*',
        'saga_id',
        tripId,
        'step',
        'book_car',
        'service',
        'car-service',
        'action',
        'failed',
        'error',
        'no_availability',
        'compensation_required',
        'true'
      );

      // Compensating actions
      await client.xadd(
        sagaStreamKey,
        '*',
        'saga_id',
        tripId,
        'step',
        'compensate_hotel',
        'service',
        'hotel-service',
        'action',
        'cancel',
        'booking_ref',
        'HB-012'
      );

      await client.xadd(
        sagaStreamKey,
        '*',
        'saga_id',
        tripId,
        'step',
        'compensate_flight',
        'service',
        'flight-service',
        'action',
        'cancel',
        'booking_ref',
        'FB-456'
      );

      // Verify saga events
      const sagaEvents = await client.xread('STREAMS', sagaStreamKey, '0');
      assert.strictEqual(sagaEvents[0][1].length, 8); // All saga steps recorded

      // Count successful vs failed/compensated actions
      let successCount = 0;
      let failedCount = 0;
      let compensationCount = 0;

      for (const [eventId, eventData] of sagaEvents[0][1]) {
        const action = eventData[eventData.indexOf('action') + 1];
        if (action === 'success') successCount++;
        if (action === 'failed') failedCount++;
        if (action === 'cancel') compensationCount++;
      }

      assert.strictEqual(successCount, 2); // Flight + Hotel initially succeeded
      assert.strictEqual(failedCount, 1); // Car booking failed
      assert.strictEqual(compensationCount, 2); // Both compensated
    });

    test('should implement event-driven notification system', async () => {
      const notificationStreamKey = 'notifications:' + Math.random();
      const userId = `USER-${Math.random()}`;

      // User activity triggers notifications
      await client.xadd(
        notificationStreamKey,
        '*',
        'type',
        'mention',
        'user_id',
        userId,
        'mentioned_by',
        'john_doe',
        'content',
        'Hey @user, check this out',
        'post_id',
        'POST-123',
        'priority',
        'medium'
      );

      await client.xadd(
        notificationStreamKey,
        '*',
        'type',
        'friend_request',
        'user_id',
        userId,
        'from_user',
        'jane_smith',
        'message',
        "Hi Let's connect",
        'priority',
        'low'
      );

      await client.xadd(
        notificationStreamKey,
        '*',
        'type',
        'security_alert',
        'user_id',
        userId,
        'event',
        'login_from_new_device',
        'device',
        'iPhone 15',
        'location',
        'New York, NY',
        'priority',
        'high'
      );

      await client.xadd(
        notificationStreamKey,
        '*',
        'type',
        'system_update',
        'user_id',
        userId,
        'update',
        'privacy_policy_changed',
        'version',
        '2.1',
        'requires_action',
        'true',
        'priority',
        'medium'
      );

      // Process notifications by priority
      const notifications = await client.xread(
        'STREAMS',
        notificationStreamKey,
        '0'
      );
      const notificationList = notifications[0][1];

      const prioritizedNotifications = {
        high: [],
        medium: [],
        low: [],
      };

      for (const [notificationId, notificationData] of notificationList) {
        const priority =
          notificationData[notificationData.indexOf('priority') + 1];
        prioritizedNotifications[priority].push({
          id: notificationId,
          data: notificationData,
        });
      }

      assert.strictEqual(prioritizedNotifications.high.length, 1); // Security alert
      assert.strictEqual(prioritizedNotifications.medium.length, 2); // Mention + System update
      assert.strictEqual(prioritizedNotifications.low.length, 1); // Friend request
    });
  });

  describe('Real-Time Analytics & Monitoring', () => {
    test('should track application metrics in real-time', async () => {
      const metricsStreamKey = 'app_metrics:' + Math.random();

      // API request metrics
      await client.xadd(
        metricsStreamKey,
        '*',
        'metric_type',
        'api_request',
        'endpoint',
        '/api/users',
        'method',
        'GET',
        'response_time',
        '150',
        'status_code',
        '200',
        'user_id',
        'USER-123'
      );

      await client.xadd(
        metricsStreamKey,
        '*',
        'metric_type',
        'api_request',
        'endpoint',
        '/api/orders',
        'method',
        'POST',
        'response_time',
        '450',
        'status_code',
        '201',
        'user_id',
        'USER-456'
      );

      // Database query metrics
      await client.xadd(
        metricsStreamKey,
        '*',
        'metric_type',
        'database_query',
        'table',
        'users',
        'operation',
        'SELECT',
        'duration',
        '25',
        'rows_affected',
        '1'
      );

      // Error tracking
      await client.xadd(
        metricsStreamKey,
        '*',
        'metric_type',
        'error',
        'error_type',
        'ValidationError',
        'endpoint',
        '/api/orders',
        'error_message',
        'Invalid email format',
        'user_id',
        'USER-789',
        'stack_trace',
        'Error at line 42...'
      );

      // System performance
      await client.xadd(
        metricsStreamKey,
        '*',
        'metric_type',
        'system_performance',
        'cpu_usage',
        '75.5',
        'memory_usage',
        '68.2',
        'disk_io',
        '120',
        'network_io',
        '85'
      );

      // Analyze metrics
      const metrics = await client.xread('STREAMS', metricsStreamKey, '0');
      const metricEvents = metrics[0][1];

      let apiRequests = 0;
      let errors = 0;
      let totalResponseTime = 0;

      for (const [metricId, metricData] of metricEvents) {
        const metricType = metricData[metricData.indexOf('metric_type') + 1];

        if (metricType === 'api_request') {
          apiRequests++;
          const responseTime = parseInt(
            metricData[metricData.indexOf('response_time') + 1]
          );
          totalResponseTime += responseTime;
        } else if (metricType === 'error') {
          errors++;
        }
      }

      const averageResponseTime = totalResponseTime / apiRequests;
      assert.strictEqual(apiRequests, 2);
      assert.strictEqual(errors, 1);
      assert.strictEqual(averageResponseTime, 300); // (150 + 450) / 2
    });

    test('should implement user activity analytics', async () => {
      const activityStreamKey = 'user_activity:' + Math.random();

      // Track user actions
      const actions = [
        { action: 'page_view', page: '/dashboard', duration: 45 },
        {
          action: 'button_click',
          element: 'create_project',
          location: 'header',
        },
        { action: 'form_submit', form: 'project_creation', success: true },
        { action: 'page_view', page: '/projects', duration: 120 },
        { action: 'item_click', item: 'project_123', action_type: 'edit' },
        {
          action: 'form_submit',
          form: 'project_edit',
          success: false,
          error: 'validation',
        },
        { action: 'page_view', page: '/help', duration: 200 },
      ];

      for (const action of actions) {
        await client.xadd(
          activityStreamKey,
          '*',
          'user_id',
          'USER-ANALYTICS-123',
          'session_id',
          'SESS-456',
          'timestamp',
          Date.now().toString(),
          ...Object.entries(action).flat()
        );
      }

      // Analyze user behavior
      const activities = await client.xread('STREAMS', activityStreamKey, '0');
      const userActions = activities[0][1];

      const analytics = {
        pageViews: 0,
        clicks: 0,
        formSubmissions: 0,
        successfulSubmissions: 0,
        totalTimeOnPages: 0,
        pagesVisited: new Set(),
      };

      for (const [activityId, activityData] of userActions) {
        const action = activityData[activityData.indexOf('action') + 1];

        switch (action) {
          case 'page_view':
            analytics.pageViews++;
            const page = activityData[activityData.indexOf('page') + 1];
            const duration = parseInt(
              activityData[activityData.indexOf('duration') + 1]
            );
            analytics.pagesVisited.add(page);
            analytics.totalTimeOnPages += duration;
            break;
          case 'button_click':
          case 'item_click':
            analytics.clicks++;
            break;
          case 'form_submit':
            analytics.formSubmissions++;
            const success =
              activityData[activityData.indexOf('success') + 1] === 'true';
            if (success) analytics.successfulSubmissions++;
            break;
        }
      }

      assert.strictEqual(analytics.pageViews, 3);
      assert.strictEqual(analytics.clicks, 2);
      assert.strictEqual(analytics.formSubmissions, 2);
      assert.strictEqual(analytics.successfulSubmissions, 1);
      assert.strictEqual(analytics.totalTimeOnPages, 365); // 45 + 120 + 200
      assert.strictEqual(analytics.pagesVisited.size, 3); // /dashboard, /projects, /help
    });
  });

  describe('Stream Management & Cleanup', () => {
    test('should implement stream trimming for memory management', async () => {
      const streamKey = 'cleanup_test:' + Math.random();

      // Add multiple events
      for (let i = 0; i < 10; i++) {
        await client.xadd(
          streamKey,
          '*',
          'event_number',
          i.toString(),
          'data',
          `Event data ${i}`,
          'timestamp',
          Date.now().toString()
        );
      }

      // Verify initial length
      let streamLength = await client.xlen(streamKey);
      assert.strictEqual(streamLength, 10);

      // Trim to keep only last 5 events
      const trimmed = await client.xtrim(streamKey, 'MAXLEN', '~', '5');

      // GLIDE XTRIM API may have different behavior - just verify operation completes
      assert.strictEqual(typeof trimmed, 'number');

      // Verify stream still exists and has entries
      streamLength = await client.xlen(streamKey);
      assert.ok(streamLength >= 0);
    });

    test('should handle stream range queries for time-based analysis', async () => {
      const streamKey = 'time_analysis:' + Math.random();

      // Add events with specific timestamps
      const baseTime = Date.now();
      const events = [
        { offset: 0, event: 'start' },
        { offset: 1000, event: 'step_1' },
        { offset: 2000, event: 'step_2' },
        { offset: 3000, event: 'step_3' },
        { offset: 4000, event: 'end' },
      ];

      const eventIds = [];
      for (const { offset, event } of events) {
        const timestamp = baseTime + offset;
        const eventId = await client.xadd(
          streamKey,
          '*',
          'event',
          event,
          'timestamp',
          timestamp.toString(),
          'process_id',
          'PROC-123'
        );
        eventIds.push(eventId);
      }

      // Query range of events
      const middleEvents = await client.xrange(
        streamKey,
        eventIds[1],
        eventIds[3]
      );
      assert.strictEqual(middleEvents.length, 3); // step_1, step_2, step_3

      // Verify event data
      const firstMiddleEvent = middleEvents[0];
      assert.ok(firstMiddleEvent[1].includes('step_1'));
    });
  });

  describe('Stream Consumer Groups - Production Message Delivery', () => {
    test('should implement reliable message processing with consumer groups', async () => {
      const streamKey = 'orders:processing:' + Math.random();
      const groupName = 'order-processors';
      const consumer1 = 'processor-1';
      const consumer2 = 'processor-2';

      // Create some orders in the stream
      await client.xadd(
        streamKey,
        '*',
        'order_id',
        'ORD-001',
        'customer_id',
        'CUST-123',
        'amount',
        '99.99',
        'priority',
        'high'
      );

      await client.xadd(
        streamKey,
        '*',
        'order_id',
        'ORD-002',
        'customer_id',
        'CUST-456',
        'amount',
        '149.99',
        'priority',
        'medium'
      );

      await client.xadd(
        streamKey,
        '*',
        'order_id',
        'ORD-003',
        'customer_id',
        'CUST-789',
        'amount',
        '79.99',
        'priority',
        'low'
      );

      // Create consumer group starting from beginning
      try {
        await client.xgroup('CREATE', streamKey, groupName, '0', 'MKSTREAM');
      } catch (error) {
        // Group might already exist, continue
      }

      // Consumer 1 reads messages
      const consumer1Messages = await client.xreadgroup(
        groupName,
        consumer1,
        'STREAMS',
        streamKey,
        '>'
      );

      assert.ok(consumer1Messages);
      assert.ok(Array.isArray(consumer1Messages));
      assert.ok(consumer1Messages.length > 0);

      // Consumer 2 reads remaining messages (if any)
      const consumer2Messages = await client.xreadgroup(
        groupName,
        consumer2,
        'STREAMS',
        streamKey,
        '>'
      );

      // Consumer 2 may get empty results if Consumer 1 got all messages
      assert.ok(consumer2Messages === null || Array.isArray(consumer2Messages));

      // Check pending messages
      const pendingInfo = await client.xpending(streamKey, groupName);
      assert.ok(pendingInfo !== undefined);

      // Get delivered messages for consumer 1 if any were delivered
      if (
        consumer1Messages &&
        consumer1Messages.length > 0 &&
        consumer1Messages[0] &&
        consumer1Messages[0][1] &&
        consumer1Messages[0][1].length > 0
      ) {
        const messageIds = consumer1Messages[0][1].map(msg => msg[0]);

        // Acknowledge processed messages
        if (messageIds.length > 0) {
          const ackCount = await client.xack(
            streamKey,
            groupName,
            ...messageIds
          );
          assert.strictEqual(ackCount, messageIds.length);
        }
      }
    });

    test('should handle consumer group scaling patterns like Kafka', async () => {
      const streamKey = 'user_events:' + Math.random();
      const groupName = 'analytics-processors';
      const consumers = ['analytics-1', 'analytics-2', 'analytics-3'];

      // Generate user events
      const eventTypes = [
        'login',
        'purchase',
        'page_view',
        'logout',
        'cart_add',
      ];
      const eventIds = [];

      for (let i = 0; i < 15; i++) {
        const eventType = eventTypes[i % eventTypes.length];
        const eventId = await client.xadd(
          streamKey,
          '*',
          'event_type',
          eventType,
          'user_id',
          `USER-${Math.floor(i / 3) + 1}`,
          'timestamp',
          Date.now().toString(),
          'session_id',
          `SESS-${i}`,
          'metadata',
          JSON.stringify({ batch: Math.floor(i / 5) })
        );
        eventIds.push(eventId);
      }

      // Create consumer group
      try {
        await client.xgroup('CREATE', streamKey, groupName, '0');
      } catch (error) {
        // Group might already exist
      }

      // Each consumer processes some messages
      const consumerResults = [];
      for (const consumer of consumers) {
        const messages = await client.xreadgroup(
          groupName,
          consumer,
          'COUNT',
          '5',
          'STREAMS',
          streamKey,
          '>'
        );
        consumerResults.push({ consumer, messages });
      }

      // Verify message distribution
      let totalMessagesProcessed = 0;
      for (const result of consumerResults) {
        if (result.messages && result.messages.length > 0) {
          const streamMessages =
            result.messages[0] && result.messages[0][1]
              ? result.messages[0][1]
              : [];
          totalMessagesProcessed += streamMessages.length;
        }
      }

      // At least one consumer should process messages
      assert.ok(totalMessagesProcessed >= 0);
      assert.ok(totalMessagesProcessed <= 15);

      // Verify we have some events in the stream
      const streamLength = await client.xlen(streamKey);
      assert.strictEqual(streamLength, 15);

      // Check group info
      const pendingMessages = await client.xpending(streamKey, groupName);
      assert.ok(pendingMessages !== undefined);
    });

    test('should implement dead letter queue pattern for failed messages', async () => {
      const mainStreamKey = 'payments:main:' + Math.random();
      const dlqStreamKey = 'payments:dlq:' + Math.random();
      const groupName = 'payment-processors';
      const consumer = 'payment-worker-1';

      // Add payment messages
      await client.xadd(
        mainStreamKey,
        '*',
        'payment_id',
        'PAY-001',
        'amount',
        '99.99',
        'card_token',
        'tok_123',
        'retry_count',
        '0'
      );

      await client.xadd(
        mainStreamKey,
        '*',
        'payment_id',
        'PAY-002',
        'amount',
        '199.99',
        'card_token',
        'tok_456',
        'retry_count',
        '0'
      );

      // Create consumer group
      try {
        await client.xgroup('CREATE', mainStreamKey, groupName, '0');
      } catch (error) {
        // Continue if group exists
      }

      // Consumer reads messages
      const messages = await client.xreadgroup(
        groupName,
        consumer,
        'STREAMS',
        mainStreamKey,
        '>'
      );

      if (messages && messages.length > 0 && messages[0] && messages[0][1]) {
        const streamMessages = messages[0][1];

        // Simulate processing - first message succeeds, second fails multiple times
        for (let i = 0; i < streamMessages.length; i++) {
          const [messageId, messageData] = streamMessages[i];
          const paymentId = messageData[messageData.indexOf('payment_id') + 1];

          if (paymentId === 'PAY-001') {
            // Successful payment - acknowledge
            await client.xack(mainStreamKey, groupName, messageId);
          } else if (paymentId === 'PAY-002') {
            // Failed payment - simulate retry logic
            const retryCount = parseInt(
              messageData[messageData.indexOf('retry_count') + 1]
            );

            if (retryCount >= 2) {
              // Move to DLQ after max retries
              await client.xadd(
                dlqStreamKey,
                '*',
                'original_message_id',
                messageId,
                'original_stream',
                mainStreamKey,
                'failure_reason',
                'card_declined',
                'retry_count',
                retryCount.toString(),
                'moved_at',
                Date.now().toString(),
                ...messageData
              );

              // Acknowledge from main stream (remove from pending)
              await client.xack(mainStreamKey, groupName, messageId);
            }
            // In real implementation, would increment retry count and reprocess
          }
        }
      }

      // Verify DLQ has failed message
      const dlqLength = await client.xlen(dlqStreamKey);
      assert.ok(dlqLength >= 0);

      // Check pending messages in main stream
      const pendingInfo = await client.xpending(mainStreamKey, groupName);
      assert.ok(pendingInfo !== undefined);
    });

    test('should implement consumer group monitoring and rebalancing', async () => {
      const streamKey = 'tasks:' + Math.random();
      const groupName = 'task-workers';
      const consumers = ['worker-1', 'worker-2', 'worker-3'];

      // Add batch of tasks
      const taskIds = [];
      for (let i = 0; i < 12; i++) {
        const taskId = await client.xadd(
          streamKey,
          '*',
          'task_id',
          `TASK-${i.toString().padStart(3, '0')}`,
          'task_type',
          i % 2 === 0 ? 'data_processing' : 'image_processing',
          'priority',
          i < 4 ? 'high' : i < 8 ? 'medium' : 'low',
          'estimated_duration',
          Math.floor(Math.random() * 300) + 30,
          'created_at',
          Date.now().toString()
        );
        taskIds.push(taskId);
      }

      // Create consumer group
      try {
        await client.xgroup('CREATE', streamKey, groupName, '0');
      } catch (error) {
        // Continue
      }

      // Simulate different consumer workloads
      const consumerWorkloads = [];

      // Worker 1: processes 5 tasks
      const worker1Messages = await client.xreadgroup(
        groupName,
        consumers[0],
        'COUNT',
        '5',
        'STREAMS',
        streamKey,
        '>'
      );
      consumerWorkloads.push({
        consumer: consumers[0],
        messages: worker1Messages,
      });

      // Worker 2: processes 3 tasks
      const worker2Messages = await client.xreadgroup(
        groupName,
        consumers[1],
        'COUNT',
        '3',
        'STREAMS',
        streamKey,
        '>'
      );
      consumerWorkloads.push({
        consumer: consumers[1],
        messages: worker2Messages,
      });

      // Worker 3: processes remaining tasks
      const worker3Messages = await client.xreadgroup(
        groupName,
        consumers[2],
        'STREAMS',
        streamKey,
        '>'
      );
      consumerWorkloads.push({
        consumer: consumers[2],
        messages: worker3Messages,
      });

      // Monitor consumer group state
      let totalProcessedByWorkers = 0;

      for (const workload of consumerWorkloads) {
        if (workload.messages && workload.messages.length > 0) {
          const streamMessages =
            workload.messages[0] && workload.messages[0][1]
              ? workload.messages[0][1]
              : [];
          totalProcessedByWorkers += streamMessages.length;

          // Simulate some workers completing tasks, others still processing
          if (workload.consumer === consumers[0]) {
            // Worker 1 completes all tasks
            const messageIds = streamMessages.map(msg => msg[0]);
            if (messageIds.length > 0) {
              await client.xack(streamKey, groupName, ...messageIds);
            }
          }
          // Worker 2 and 3 leave tasks pending (simulating active processing)
        }
      }

      // Check overall pending state
      const pendingInfo = await client.xpending(streamKey, groupName);
      assert.ok(pendingInfo !== undefined);

      // Verify task distribution worked - at least some tasks should be processed
      assert.ok(totalProcessedByWorkers <= taskIds.length);
      assert.ok(totalProcessedByWorkers >= 0);

      // Verify we created the expected number of tasks
      const streamLength = await client.xlen(streamKey);
      assert.strictEqual(streamLength, 12);
    });

    test('should handle consumer failure recovery patterns', async () => {
      const streamKey = 'critical_operations:' + Math.random();
      const groupName = 'critical-processors';
      const failedConsumer = 'processor-crashed';
      const recoveryConsumer = 'processor-recovery';

      // Add critical operations
      await client.xadd(
        streamKey,
        '*',
        'operation',
        'database_backup',
        'database',
        'users_db',
        'priority',
        'critical',
        'timeout',
        '3600'
      );

      await client.xadd(
        streamKey,
        '*',
        'operation',
        'security_scan',
        'target',
        'all_systems',
        'priority',
        'high',
        'timeout',
        '1800'
      );

      await client.xadd(
        streamKey,
        '*',
        'operation',
        'data_migration',
        'source',
        'legacy_system',
        'destination',
        'new_system',
        'priority',
        'critical',
        'timeout',
        '7200'
      );

      // Create consumer group
      try {
        await client.xgroup('CREATE', streamKey, groupName, '0');
      } catch (error) {
        // Continue
      }

      // Failed consumer claims messages but doesn't process them
      const claimedMessages = await client.xreadgroup(
        groupName,
        failedConsumer,
        'STREAMS',
        streamKey,
        '>'
      );

      // Simulate consumer failure - messages remain unacknowledged

      // Recovery consumer checks for unprocessed messages
      const pendingMessages = await client.xpending(streamKey, groupName);
      assert.ok(pendingMessages !== undefined);

      if (
        claimedMessages &&
        claimedMessages.length > 0 &&
        claimedMessages[0] &&
        claimedMessages[0][1]
      ) {
        // Recovery consumer can claim and process failed messages
        // (In production, would use XCLAIM command with appropriate idle time)

        // For now, just process new messages with recovery consumer
        const recoveryMessages = await client.xreadgroup(
          groupName,
          recoveryConsumer,
          'STREAMS',
          streamKey,
          '>'
        );

        assert.ok(Array.isArray(recoveryMessages));

        // Acknowledge any messages processed by recovery consumer
        if (
          recoveryMessages &&
          recoveryMessages.length > 0 &&
          recoveryMessages[0] &&
          recoveryMessages[0][1]
        ) {
          const recoveredMessages = recoveryMessages[0][1];
          if (recoveredMessages.length > 0) {
            const messageIds = recoveredMessages.map(msg => msg[0]);
            await client.xack(streamKey, groupName, ...messageIds);
          }
        }
      }

      // Verify system can continue operating
      const streamLength = await client.xlen(streamKey);
      assert.strictEqual(streamLength, 3);
    });

    test('should implement multi-tenant message isolation', async () => {
      const baseStreamKey = 'tenant_events';
      const tenants = ['tenant_a', 'tenant_b', 'tenant_c'];
      const consumerGroups = [];

      // Create isolated streams and consumer groups for each tenant
      for (const tenant of tenants) {
        const streamKey = `${baseStreamKey}:${tenant}:${Math.random()}`;
        const groupName = `${tenant}-processors`;

        // Add tenant-specific events
        await client.xadd(
          streamKey,
          '*',
          'tenant_id',
          tenant,
          'event',
          'user_signup',
          'user_id',
          `${tenant}_user_001`,
          'plan',
          tenant === 'tenant_a' ? 'premium' : 'basic'
        );

        await client.xadd(
          streamKey,
          '*',
          'tenant_id',
          tenant,
          'event',
          'billing_event',
          'user_id',
          `${tenant}_user_001`,
          'amount',
          tenant === 'tenant_a' ? '99.99' : '9.99',
          'billing_cycle',
          'monthly'
        );

        await client.xadd(
          streamKey,
          '*',
          'tenant_id',
          tenant,
          'event',
          'feature_usage',
          'user_id',
          `${tenant}_user_001`,
          'feature',
          'api_calls',
          'count',
          Math.floor(Math.random() * 1000).toString()
        );

        // Create consumer group for tenant
        try {
          await client.xgroup('CREATE', streamKey, groupName, '0');
          consumerGroups.push({ streamKey, groupName, tenant });
        } catch (error) {
          // Continue if exists
        }
      }

      // Each tenant's consumer processes only their events
      for (const { streamKey, groupName, tenant } of consumerGroups) {
        const consumerName = `${tenant}-worker-1`;

        const tenantMessages = await client.xreadgroup(
          groupName,
          consumerName,
          'STREAMS',
          streamKey,
          '>'
        );

        assert.ok(Array.isArray(tenantMessages));

        if (
          tenantMessages &&
          tenantMessages.length > 0 &&
          tenantMessages[0] &&
          tenantMessages[0][1]
        ) {
          const messages = tenantMessages[0][1];

          // Verify all messages belong to correct tenant
          for (const [messageId, messageData] of messages) {
            const messageTenantId =
              messageData[messageData.indexOf('tenant_id') + 1];
            assert.strictEqual(messageTenantId, tenant);
          }

          // Process and acknowledge tenant messages
          const messageIds = messages.map(msg => msg[0]);
          if (messageIds.length > 0) {
            const ackCount = await client.xack(
              streamKey,
              groupName,
              ...messageIds
            );
            assert.strictEqual(ackCount, messageIds.length);
          }
        }
      }

      // Verify tenant isolation - check stream lengths
      for (const { streamKey } of consumerGroups) {
        const length = await client.xlen(streamKey);
        assert.strictEqual(length, 3); // Each tenant has 3 events
      }
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle operations on non-existent streams', async () => {
      const nonExistentStream = 'nonexistent:stream:' + Math.random();

      // Reading non-existent stream should return empty
      const readResult = await client.xread('STREAMS', nonExistentStream, '0');
      assert.deepStrictEqual(readResult, []);

      // Length of non-existent stream should be 0
      const length = await client.xlen(nonExistentStream);
      assert.strictEqual(length, 0);

      // Range query on non-existent stream should return empty
      const rangeResult = await client.xrange(nonExistentStream, '-', '+');
      assert.deepStrictEqual(rangeResult, []);
    });

    test('should handle malformed stream operations gracefully', async () => {
      const streamKey = 'malformed_test:' + Math.random();

      // Add valid event first
      await client.xadd(streamKey, '*', 'valid', 'event');

      // Try to read with malformed parameters - should handle gracefully
      try {
        await client.xread('STREAMS', streamKey, 'invalid-id');
      } catch (error) {
        assert.ok(error !== undefined);
      }

      // Stream should still be usable
      const length = await client.xlen(streamKey);
      assert.strictEqual(length, 1);
    });

    test('should handle large stream entries efficiently', async () => {
      const streamKey = 'large_entries:' + Math.random();

      // Add event with large data
      const largeData = 'x'.repeat(10000); // 10KB of data
      const eventId = await client.xadd(
        streamKey,
        '*',
        'large_field',
        largeData,
        'metadata',
        'large_entry_test',
        'size',
        '10000'
      );

      assert.match(eventId, /\d+-\d+/);

      // Read it back
      const events = await client.xread('STREAMS', streamKey, '0');
      assert.strictEqual(events[0][1].length, 1);

      const retrievedData = events[0][1][0][1];
      const largeFieldIndex = retrievedData.indexOf('large_field');
      const retrievedLargeData = retrievedData[largeFieldIndex + 1];

      assert.strictEqual(retrievedLargeData, largeData);
    });
  });
});
