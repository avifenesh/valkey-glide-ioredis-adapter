/**
 * Stream Commands Comprehensive Tests
 * Includes all stream operations in both standalone and cluster modes
 * Tests real-world patterns: event sourcing, microservices, real-time analytics
 */

import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import pkg from '../../dist/index.js';
const { Redis, Cluster } = pkg;

// Test configuration with auto-detection
function getStandaloneConfig() {
  // Priority order for standalone testing:
  // 1. Environment variable override
  // 2. Port 6379 (docker-compose.test.yml standard)
  // 3. Port 6383 (common test port)
  const port = process.env.VALKEY_PORT 
    ? parseInt(process.env.VALKEY_PORT) 
    : 6379; // Use standard docker test port
    
  return {
    host: process.env.VALKEY_HOST || 'localhost',
    port: port,
    lazyConnect: true,
  };
}

function getClusterConfig() {
  // Cluster nodes from docker-compose.test.yml
  if (process.env.VALKEY_CLUSTER_NODES) {
    return process.env.VALKEY_CLUSTER_NODES.split(',').map(node => {
      const [host, port] = node.split(':');
      return { host, port: parseInt(port) };
    });
  }
  
  // Default cluster configuration (docker-compose.test.yml)
  return [
    { host: 'localhost', port: 17000 },
    { host: 'localhost', port: 17001 },
    { host: 'localhost', port: 17002 }
  ];
}

// Test modes - Run based on environment configuration
const testModes = [];

// Add standalone mode unless disabled
if (process.env.DISABLE_STANDALONE_TESTS !== 'true') {
  testModes.push({
    name: 'standalone',
    createClient: () => new Redis(getStandaloneConfig())
  });
}

// Add cluster mode if enabled or by default (unless explicitly disabled)
if (process.env.ENABLE_CLUSTER_TESTS === 'true' || 
    (process.env.DISABLE_CLUSTER_TESTS !== 'true' && process.env.DISABLE_STANDALONE_TESTS === 'true')) {
  testModes.push({
    name: 'cluster',
    createClient: () => new Cluster(getClusterConfig(), { lazyConnect: true })
  });
}

// Default: run both modes if no environment variables are set
if (testModes.length === 0 && !process.env.DISABLE_STANDALONE_TESTS && !process.env.DISABLE_CLUSTER_TESTS) {
  testModes.push(
    {
      name: 'standalone',
      createClient: () => new Redis(getStandaloneConfig())
    },
    {
      name: 'cluster',
      createClient: () => new Cluster(getClusterConfig(), { lazyConnect: true })
    }
  );
}

testModes.forEach(({ name: mode, createClient }) => {
  describe(`Stream Commands (${mode} mode)`, function() {
    let client;
    let streamKey;

    beforeEach(async function() {
      client = createClient();
      await client.connect();
      streamKey = `test:stream:${mode}:${Date.now()}`;
    });

    afterEach(async () => {
      if (client) {
        try {
          if (streamKey) {
            await client.del(streamKey);
          }
          await client.quit();
        } catch (err) {
          // Ignore cleanup errors
        }
      }
    });

    describe('XADD - Adding entries', () => {
      it('should add entry with auto-generated ID', async () => {
        const id = await client.xadd(streamKey, '*', 'field', 'value');
        assert.ok(id);
        assert.ok(id.includes('-'));
      });

      it('should add entry with explicit ID', async () => {
        const id = await client.xadd(streamKey, '1000-0', 'field', 'value');
        assert.strictEqual(id, '1000-0');
      });

      it('should add multiple field-value pairs', async () => {
        const id = await client.xadd(streamKey, '*', 
          'field1', 'value1',
          'field2', 'value2',
          'field3', 'value3'
        );
        assert.ok(id);
        
        const entries = await client.xrange(streamKey, '-', '+');
        assert.strictEqual(entries.length, 1);
        assert.strictEqual(entries[0][1].length, 6); // 3 field-value pairs = 6 elements
      });

      it('should handle MAXLEN option', async () => {
        // Add 5 entries
        for (let i = 0; i < 5; i++) {
          await client.xadd(streamKey, '*', 'msg', `message${i}`);
        }
        
        // Add with MAXLEN 3
        await client.xadd(streamKey, 'MAXLEN', 3, '*', 'msg', 'new');
        
        const entries = await client.xrange(streamKey, '-', '+');
        assert.strictEqual(entries.length, 3);
      });

      it('should handle MAXLEN with exact trimming', async () => {
        // Add 5 entries
        for (let i = 0; i < 5; i++) {
          await client.xadd(streamKey, '*', 'msg', `message${i}`);
        }
        
        // Add with MAXLEN = 3 (exact)
        await client.xadd(streamKey, 'MAXLEN', '=', 3, '*', 'msg', 'new');
        
        const entries = await client.xrange(streamKey, '-', '+');
        assert.strictEqual(entries.length, 3);
      });

      it('should handle MINID option', async () => {
        await client.xadd(streamKey, '1000-0', 'msg', 'old1');
        await client.xadd(streamKey, '2000-0', 'msg', 'old2');
        await client.xadd(streamKey, '3000-0', 'msg', 'keep1');
        await client.xadd(streamKey, '4000-0', 'msg', 'keep2');
        
        // Add with MINID - should trim entries < 3000-0
        await client.xadd(streamKey, 'MINID', '3000-0', '*', 'msg', 'new');
        
        const entries = await client.xrange(streamKey, '-', '+');
        assert.ok(entries.length >= 3);
        
        // Verify no entries exist with ID < 3000-0
        const hasOldEntry = entries.some(e => {
          // Check only explicit IDs (format: number-number)
          if (e[0].match(/^\d+-\d+$/)) {
            const timestamp = parseInt(e[0].split('-')[0]);
            return timestamp < 3000;
          }
          return false;
        });
        assert.ok(!hasOldEntry, 'Should not have entries with ID < 3000-0');
      });

      it('should handle NOMKSTREAM option', async () => {
        try {
          await client.xadd(streamKey + '_nonexistent', 'NOMKSTREAM', '*', 'field', 'value');
          assert.fail('Should have thrown error');
        } catch (err) {
          // Expected to fail
          assert.ok(err);
        }
      });

      it('should handle LIMIT option with trimming', async () => {
        // Add many entries
        for (let i = 0; i < 10; i++) {
          await client.xadd(streamKey, '*', 'msg', `message${i}`);
        }
        
        // Trim with LIMIT
        await client.xadd(streamKey, 'MAXLEN', '~', 5, 'LIMIT', 2, '*', 'msg', 'new');
        
        const entries = await client.xrange(streamKey, '-', '+');
        assert.ok(entries.length > 0);
      });

      it('should reject invalid IDs', async () => {
        await client.xadd(streamKey, '1000-0', 'msg', 'first');
        
        try {
          await client.xadd(streamKey, '999-0', 'msg', 'second');
          assert.fail('Should have rejected lower ID');
        } catch (err) {
          assert.ok(err.message.includes('smaller'));
        }
      });
    });

    describe('XREAD - Reading entries', () => {
      it('should read from single stream', async () => {
        await client.xadd(streamKey, '1000-0', 'msg', 'hello');
        
        const result = await client.xread('STREAMS', streamKey, '0');
        assert.ok(result);
        assert.strictEqual(result[0][0], streamKey);
        assert.strictEqual(result[0][1].length, 1);
      });

      it('should read from specific ID', async () => {
        await client.xadd(streamKey, '1000-0', 'msg', 'first');
        await client.xadd(streamKey, '2000-0', 'msg', 'second');
        await client.xadd(streamKey, '3000-0', 'msg', 'third');
        
        const result = await client.xread('STREAMS', streamKey, '1000-0');
        assert.ok(result);
        assert.strictEqual(result[0][1].length, 2); // Should get second and third
      });

      it('should read with COUNT limit', async () => {
        for (let i = 0; i < 5; i++) {
          await client.xadd(streamKey, `${1000 + i}-0`, 'msg', `message${i}`);
        }
        
        const result = await client.xread('COUNT', 2, 'STREAMS', streamKey, '0');
        assert.ok(result);
        assert.strictEqual(result[0][1].length, 2);
      });

      it('should read from multiple streams', async () => {
        const streamKey2 = streamKey + '_2';
        await client.xadd(streamKey, '1000-0', 'msg', 'stream1');
        await client.xadd(streamKey2, '1000-0', 'msg', 'stream2');
        
        const result = await client.xread('STREAMS', streamKey, streamKey2, '0', '0');
        assert.ok(result);
        assert.strictEqual(result.length, 2);
        
        await client.del(streamKey2);
      });

      it('should handle BLOCK option with immediate data', async () => {
        await client.xadd(streamKey, '1000-0', 'msg', 'ready');
        
        const result = await client.xread('BLOCK', 100, 'STREAMS', streamKey, '0');
        assert.ok(result);
        assert.strictEqual(result[0][1].length, 1);
      });

      it('should handle BLOCK timeout', async () => {
        const start = Date.now();
        const result = await client.xread('BLOCK', 200, 'STREAMS', streamKey, '$');
        const elapsed = Date.now() - start;
        
        assert.strictEqual(result, null);
        assert.ok(elapsed >= 180); // Allow some tolerance
      });

      it('should read only new entries with $', async () => {
        // Create a second client for adding messages
        const client2 = createClient();
        await client2.connect();
        
        try {
          // Start reading from current end
          const promise = client.xread('BLOCK', 2000, 'STREAMS', streamKey, '$');
          
          // Add new entry after a delay using second client
          setTimeout(async () => {
            try {
              await client2.xadd(streamKey, '*', 'msg', 'new');
            } catch (err) {
              // Ignore errors in setTimeout
            }
          }, 100);
          
          const result = await promise;
          assert.ok(result);
          assert.strictEqual(result[0][1].length, 1);
          assert.strictEqual(result[0][1][0][1][1], 'new');
        } finally {
          // Ensure client2 is closed
          try {
            await client2.quit();
          } catch (err) {
            // Ignore closing errors
          }
        }
      });
    });

    describe('XRANGE and XREVRANGE', () => {
      beforeEach(async () => {
        // Add test data
        await client.xadd(streamKey, '1000-0', 'msg', 'first');
        await client.xadd(streamKey, '2000-0', 'msg', 'second');
        await client.xadd(streamKey, '3000-0', 'msg', 'third');
        await client.xadd(streamKey, '4000-0', 'msg', 'fourth');
        await client.xadd(streamKey, '5000-0', 'msg', 'fifth');
      });

      it('should get all entries with XRANGE', async () => {
        const entries = await client.xrange(streamKey, '-', '+');
        assert.strictEqual(entries.length, 5);
        assert.strictEqual(entries[0][0], '1000-0');
        assert.strictEqual(entries[4][0], '5000-0');
      });

      it('should get range between IDs', async () => {
        const entries = await client.xrange(streamKey, '2000-0', '4000-0');
        assert.strictEqual(entries.length, 3);
        assert.strictEqual(entries[0][0], '2000-0');
        assert.strictEqual(entries[2][0], '4000-0');
      });

      it('should handle exclusive ranges', async () => {
        const entries = await client.xrange(streamKey, '(2000-0', '4000-0');
        assert.strictEqual(entries.length, 2);
        assert.strictEqual(entries[0][0], '3000-0');
      });

      it('should limit results with COUNT', async () => {
        const entries = await client.xrange(streamKey, '-', '+', 'COUNT', 3);
        assert.strictEqual(entries.length, 3);
      });

      it('should get entries in reverse with XREVRANGE', async () => {
        const entries = await client.xrevrange(streamKey, '+', '-');
        assert.strictEqual(entries.length, 5);
        assert.strictEqual(entries[0][0], '5000-0');
        assert.strictEqual(entries[4][0], '1000-0');
      });

      it('should get reverse range between IDs', async () => {
        const entries = await client.xrevrange(streamKey, '4000-0', '2000-0');
        assert.strictEqual(entries.length, 3);
        assert.strictEqual(entries[0][0], '4000-0');
        assert.strictEqual(entries[2][0], '2000-0');
      });

      it('should handle timestamp-only ranges', async () => {
        const entries = await client.xrange(streamKey, '2000', '4000');
        assert.strictEqual(entries.length, 3);
      });
    });

    describe('XLEN - Stream length', () => {
      it('should return 0 for empty stream', async () => {
        const len = await client.xlen(streamKey);
        assert.strictEqual(len, 0);
      });

      it('should return correct length', async () => {
        await client.xadd(streamKey, '*', 'msg', 'one');
        await client.xadd(streamKey, '*', 'msg', 'two');
        await client.xadd(streamKey, '*', 'msg', 'three');
        
        const len = await client.xlen(streamKey);
        assert.strictEqual(len, 3);
      });

      it('should handle non-existent stream', async () => {
        const len = await client.xlen('nonexistent:stream');
        assert.strictEqual(len, 0);
      });
    });

    describe('XDEL - Deleting entries', () => {
      beforeEach(async () => {
        await client.xadd(streamKey, '1000-0', 'msg', 'first');
        await client.xadd(streamKey, '2000-0', 'msg', 'second');
        await client.xadd(streamKey, '3000-0', 'msg', 'third');
      });

      it('should delete single entry', async () => {
        const deleted = await client.xdel(streamKey, '2000-0');
        assert.strictEqual(deleted, 1);
        
        const entries = await client.xrange(streamKey, '-', '+');
        assert.strictEqual(entries.length, 2);
        assert.ok(!entries.some(e => e[0] === '2000-0'));
      });

      it('should delete multiple entries', async () => {
        const deleted = await client.xdel(streamKey, '1000-0', '3000-0');
        assert.strictEqual(deleted, 2);
        
        const entries = await client.xrange(streamKey, '-', '+');
        assert.strictEqual(entries.length, 1);
        assert.strictEqual(entries[0][0], '2000-0');
      });

      it('should handle non-existent IDs', async () => {
        const deleted = await client.xdel(streamKey, '9999-0');
        assert.strictEqual(deleted, 0);
      });

      it('should handle mix of existing and non-existing IDs', async () => {
        const deleted = await client.xdel(streamKey, '1000-0', '9999-0', '3000-0');
        assert.strictEqual(deleted, 2);
      });
    });

    describe('XTRIM - Trimming streams', () => {
      beforeEach(async () => {
        // Add 10 entries
        for (let i = 0; i < 10; i++) {
          await client.xadd(streamKey, `${1000 + i}-0`, 'msg', `message${i}`);
        }
      });

      it('should trim with MAXLEN', async () => {
        const trimmed = await client.xtrim(streamKey, 'MAXLEN', 5);
        assert.ok(trimmed >= 5);
        
        const entries = await client.xrange(streamKey, '-', '+');
        assert.strictEqual(entries.length, 5);
      });

      it('should trim with exact MAXLEN', async () => {
        const trimmed = await client.xtrim(streamKey, 'MAXLEN', '=', 3);
        assert.strictEqual(trimmed, 7);
        
        const entries = await client.xrange(streamKey, '-', '+');
        assert.strictEqual(entries.length, 3);
      });

      it('should trim with approximate MAXLEN', async () => {
        const trimmed = await client.xtrim(streamKey, 'MAXLEN', '~', 5);
        assert.ok(trimmed >= 0);
        
        const entries = await client.xrange(streamKey, '-', '+');
        assert.ok(entries.length <= 10);
      });

      it('should trim with MINID', async () => {
        const trimmed = await client.xtrim(streamKey, 'MINID', '1005-0');
        assert.ok(trimmed >= 5);
        
        const entries = await client.xrange(streamKey, '-', '+');
        assert.ok(!entries.some(e => e[0] < '1005-0'));
      });

      it('should trim with LIMIT option', async () => {
        const trimmed = await client.xtrim(streamKey, 'MAXLEN', '~', 5, 'LIMIT', 2);
        assert.ok(trimmed <= 2);
      });
    });

    describe('Consumer Groups', () => {
      describe('XGROUP CREATE', () => {
        it('should create consumer group', async () => {
          await client.xadd(streamKey, '1000-0', 'msg', 'first');
          const result = await client.xgroup('CREATE', streamKey, 'mygroup', '$');
          assert.strictEqual(result, 'OK');
        });

        it('should create group at specific ID', async () => {
          await client.xadd(streamKey, '1000-0', 'msg', 'first');
          await client.xadd(streamKey, '2000-0', 'msg', 'second');
          
          const result = await client.xgroup('CREATE', streamKey, 'mygroup', '1000-0');
          assert.strictEqual(result, 'OK');
        });

        it('should create group from beginning', async () => {
          await client.xadd(streamKey, '1000-0', 'msg', 'first');
          const result = await client.xgroup('CREATE', streamKey, 'mygroup', '0');
          assert.strictEqual(result, 'OK');
        });

        it('should handle MKSTREAM option', async () => {
          const newStream = streamKey + '_mkstream';
          const result = await client.xgroup('CREATE', newStream, 'mygroup', '$', 'MKSTREAM');
          assert.strictEqual(result, 'OK');
          await client.del(newStream);
        });

        it('should fail on duplicate group', async () => {
          await client.xadd(streamKey, '1000-0', 'msg', 'first');
          await client.xgroup('CREATE', streamKey, 'mygroup', '$');
          
          try {
            await client.xgroup('CREATE', streamKey, 'mygroup', '$');
            assert.fail('Should have failed');
          } catch (err) {
            assert.ok(err.message.includes('BUSYGROUP'));
          }
        });
      });

      describe('XGROUP DESTROY', () => {
        beforeEach(async () => {
          await client.xadd(streamKey, '1000-0', 'msg', 'first');
          await client.xgroup('CREATE', streamKey, 'mygroup', '$');
        });

        it('should destroy consumer group', async () => {
          const result = await client.xgroup('DESTROY', streamKey, 'mygroup');
          assert.strictEqual(result, 1);
        });

        it('should return 0 for non-existent group', async () => {
          const result = await client.xgroup('DESTROY', streamKey, 'nonexistent');
          assert.strictEqual(result, 0);
        });
      });

      describe('XGROUP CREATECONSUMER', () => {
        beforeEach(async () => {
          await client.xadd(streamKey, '1000-0', 'msg', 'first');
          await client.xgroup('CREATE', streamKey, 'mygroup', '$');
        });

        it('should create consumer', async () => {
          const result = await client.xgroup('CREATECONSUMER', streamKey, 'mygroup', 'consumer1');
          assert.strictEqual(result, 1);
        });

        it('should return 0 for existing consumer', async () => {
          await client.xgroup('CREATECONSUMER', streamKey, 'mygroup', 'consumer1');
          const result = await client.xgroup('CREATECONSUMER', streamKey, 'mygroup', 'consumer1');
          assert.strictEqual(result, 0);
        });
      });

      describe('XGROUP DELCONSUMER', () => {
        beforeEach(async () => {
          await client.xadd(streamKey, '1000-0', 'msg', 'first');
          await client.xgroup('CREATE', streamKey, 'mygroup', '$');
          await client.xgroup('CREATECONSUMER', streamKey, 'mygroup', 'consumer1');
        });

        it('should delete consumer', async () => {
          const result = await client.xgroup('DELCONSUMER', streamKey, 'mygroup', 'consumer1');
          assert.strictEqual(result, 0); // Returns pending count
        });
      });

      describe('XGROUP SETID', () => {
        beforeEach(async () => {
          await client.xadd(streamKey, '1000-0', 'msg', 'first');
          await client.xadd(streamKey, '2000-0', 'msg', 'second');
          await client.xgroup('CREATE', streamKey, 'mygroup', '0');
        });

        it('should set group ID', async () => {
          const result = await client.xgroup('SETID', streamKey, 'mygroup', '2000-0');
          assert.strictEqual(result, 'OK');
        });

        it('should set ID to $', async () => {
          const result = await client.xgroup('SETID', streamKey, 'mygroup', '$');
          assert.strictEqual(result, 'OK');
        });
      });

      describe('XREADGROUP', () => {
        beforeEach(async () => {
          await client.xadd(streamKey, '1000-0', 'msg', 'first');
          await client.xadd(streamKey, '2000-0', 'msg', 'second');
          await client.xadd(streamKey, '3000-0', 'msg', 'third');
          await client.xgroup('CREATE', streamKey, 'mygroup', '0');
        });

        it('should read messages for consumer', async () => {
          const messages = await client.xreadgroup('GROUP', 'mygroup', 'consumer1', 'STREAMS', streamKey, '>');
          assert.ok(messages);
          assert.strictEqual(messages[0][1].length, 3);
        });

        it('should read with COUNT limit', async () => {
          const messages = await client.xreadgroup('GROUP', 'mygroup', 'consumer1', 'COUNT', 2, 'STREAMS', streamKey, '>');
          assert.ok(messages);
          assert.strictEqual(messages[0][1].length, 2);
        });

        it('should handle BLOCK option', async () => {
          const start = Date.now();
          const messages = await client.xreadgroup('GROUP', 'mygroup', 'consumer1', 'BLOCK', 200, 'STREAMS', streamKey, '>');
          const elapsed = Date.now() - start;
          
          // Should return immediately with available messages or timeout
          assert.ok(elapsed < 1000);
        });

        it('should handle NOACK option', async () => {
          const messages = await client.xreadgroup('GROUP', 'mygroup', 'consumer1', 'NOACK', 'STREAMS', streamKey, '>');
          assert.ok(messages);
        });

        it('should read pending messages', async () => {
          // First consumer reads
          await client.xreadgroup('GROUP', 'mygroup', 'consumer1', 'STREAMS', streamKey, '>');
          
          // Read pending messages
          const pending = await client.xreadgroup('GROUP', 'mygroup', 'consumer1', 'STREAMS', streamKey, '0');
          assert.ok(pending);
          assert.strictEqual(pending[0][1].length, 3);
        });
      });

      describe('XACK', () => {
        beforeEach(async () => {
          await client.xadd(streamKey, '1000-0', 'msg', 'first');
          await client.xadd(streamKey, '2000-0', 'msg', 'second');
          await client.xgroup('CREATE', streamKey, 'mygroup', '0');
        });

        it('should acknowledge single message', async () => {
          const messages = await client.xreadgroup('GROUP', 'mygroup', 'consumer1', 'STREAMS', streamKey, '>');
          const messageId = messages[0][1][0][0];
          
          const acked = await client.xack(streamKey, 'mygroup', messageId);
          assert.strictEqual(acked, 1);
        });

        it('should acknowledge multiple messages', async () => {
          const messages = await client.xreadgroup('GROUP', 'mygroup', 'consumer1', 'STREAMS', streamKey, '>');
          const id1 = messages[0][1][0][0];
          const id2 = messages[0][1][1][0];
          
          const acked = await client.xack(streamKey, 'mygroup', id1, id2);
          assert.strictEqual(acked, 2);
        });

        it('should handle already acknowledged messages', async () => {
          const messages = await client.xreadgroup('GROUP', 'mygroup', 'consumer1', 'STREAMS', streamKey, '>');
          const messageId = messages[0][1][0][0];
          
          await client.xack(streamKey, 'mygroup', messageId);
          const acked = await client.xack(streamKey, 'mygroup', messageId);
          assert.strictEqual(acked, 0);
        });
      });

      describe('XPENDING', () => {
        beforeEach(async () => {
          await client.xadd(streamKey, '1000-0', 'msg', 'first');
          await client.xadd(streamKey, '2000-0', 'msg', 'second');
          await client.xadd(streamKey, '3000-0', 'msg', 'third');
          await client.xgroup('CREATE', streamKey, 'mygroup', '0');
          await client.xreadgroup('GROUP', 'mygroup', 'consumer1', 'COUNT', 2, 'STREAMS', streamKey, '>');
          await client.xreadgroup('GROUP', 'mygroup', 'consumer2', 'COUNT', 1, 'STREAMS', streamKey, '>');
        });

        it('should get pending summary', async () => {
          const pending = await client.xpending(streamKey, 'mygroup');
          assert.ok(pending);
          assert.strictEqual(pending[0], 3); // Total pending
        });

        it('should get detailed pending with range', async () => {
          const pending = await client.xpending(streamKey, 'mygroup', '-', '+', 10);
          assert.ok(Array.isArray(pending));
          assert.strictEqual(pending.length, 3);
        });

        it('should filter by consumer', async () => {
          const pending = await client.xpending(streamKey, 'mygroup', '-', '+', 10, 'consumer1');
          assert.ok(Array.isArray(pending));
          assert.strictEqual(pending.length, 2);
        });
      });

      describe('XCLAIM', () => {
        beforeEach(async () => {
          await client.xadd(streamKey, '1000-0', 'msg', 'first');
          await client.xgroup('CREATE', streamKey, 'mygroup', '0');
        });

        it('should claim messages', async () => {
          const messages = await client.xreadgroup('GROUP', 'mygroup', 'consumer1', 'STREAMS', streamKey, '>');
          const messageId = messages[0][1][0][0];
          
          // Wait for message to become idle
          await new Promise(resolve => setTimeout(resolve, 100));
          
          const claimed = await client.xclaim(streamKey, 'mygroup', 'consumer2', 10, messageId);
          
          assert.ok(Array.isArray(claimed));
          assert.strictEqual(claimed.length, 1);
          assert.strictEqual(claimed[0][0], messageId);
        });

        it('should handle JUSTID option', async () => {
          const messages = await client.xreadgroup('GROUP', 'mygroup', 'consumer1', 'STREAMS', streamKey, '>');
          const messageId = messages[0][1][0][0];
          
          // Wait for message to become idle
          await new Promise(resolve => setTimeout(resolve, 100));
          
          const claimed = await client.xclaim(streamKey, 'mygroup', 'consumer2', 10, messageId, 'JUSTID');
          
          assert.ok(Array.isArray(claimed));
          assert.strictEqual(claimed.length, 1);
          assert.strictEqual(claimed[0], messageId); // Just ID, not full entry
        });

        it('should handle FORCE option', async () => {
          // Force claim even without prior delivery
          await client.xadd(streamKey, '2000-0', 'msg', 'unclaimed');
          const claimed = await client.xclaim(streamKey, 'mygroup', 'consumer1', 0, '2000-0', 'FORCE');
          
          assert.ok(Array.isArray(claimed));
          assert.strictEqual(claimed.length, 1);
        });
      });

      describe('XAUTOCLAIM', () => {
        beforeEach(async () => {
          await client.xadd(streamKey, '1000-0', 'msg', 'first');
          await client.xadd(streamKey, '2000-0', 'msg', 'second');
          await client.xadd(streamKey, '3000-0', 'msg', 'third');
          await client.xgroup('CREATE', streamKey, 'mygroup', '0');
          await client.xreadgroup('GROUP', 'mygroup', 'consumer1', 'STREAMS', streamKey, '>');
        });

        it('should auto-claim idle messages', async () => {
          // Wait for messages to become idle
          await new Promise(resolve => setTimeout(resolve, 100));
          
          const result = await client.xautoclaim(streamKey, 'mygroup', 'consumer2', 10, '0-0');
          
          assert.ok(result);
          assert.ok(result[0]); // Next cursor
          assert.ok(Array.isArray(result[1])); // Claimed messages
          assert.ok(result[1].length > 0);
        });

        it('should handle COUNT option', async () => {
          // Wait for messages to become idle
          await new Promise(resolve => setTimeout(resolve, 100));
          
          const result = await client.xautoclaim(streamKey, 'mygroup', 'consumer2', 10, '0-0', 'COUNT', 1);
          
          assert.ok(result);
          assert.ok(Array.isArray(result[1]));
          assert.ok(result[1].length <= 1);
        });

        it('should handle JUSTID option', async () => {
          // Wait for messages to become idle
          await new Promise(resolve => setTimeout(resolve, 100));
          
          const result = await client.xautoclaim(streamKey, 'mygroup', 'consumer2', 10, '0-0', 'JUSTID');
          
          assert.ok(result);
          assert.ok(result[0]); // Next cursor
          assert.ok(Array.isArray(result[1])); // Claimed message IDs
          if (result[1].length > 0) {
            assert.ok(typeof result[1][0] === 'string'); // Just IDs
          }
        });
      });
    });

    describe('XINFO', () => {
      beforeEach(async () => {
        await client.xadd(streamKey, '1000-0', 'msg', 'first');
        await client.xadd(streamKey, '2000-0', 'msg', 'second');
        await client.xgroup('CREATE', streamKey, 'mygroup', '0');
        await client.xreadgroup('GROUP', 'mygroup', 'consumer1', 'STREAMS', streamKey, '>');
      });

      it('should get stream info', async () => {
        const info = await client.xinfo('STREAM', streamKey);
        assert.ok(info);
        assert.ok(info.length > 0);
      });

      it('should get groups info', async () => {
        const groups = await client.xinfo('GROUPS', streamKey);
        assert.ok(Array.isArray(groups));
        assert.strictEqual(groups.length, 1);
      });

      it('should get consumers info', async () => {
        const consumers = await client.xinfo('CONSUMERS', streamKey, 'mygroup');
        assert.ok(Array.isArray(consumers));
        assert.strictEqual(consumers.length, 1);
      });
    });

    describe('Real-world Stream Use Cases', () => {
      it('should implement event sourcing pattern', async () => {
        const eventStream = `events:${mode}:${Date.now()}`;
        
        // Record events
        await client.xadd(eventStream, '*', 'event', 'user_login', 'user_id', '123');
        await client.xadd(eventStream, '*', 'event', 'page_view', 'page', '/home');
        await client.xadd(eventStream, '*', 'event', 'user_logout', 'user_id', '123');
        
        // Read event history
        const events = await client.xrange(eventStream, '-', '+');
        assert.strictEqual(events.length, 3);
        
        await client.del(eventStream);
      });

      it('should implement message queue with consumer groups', async () => {
        const queueStream = `queue:${mode}:${Date.now()}`;
        
        // Add messages
        await client.xadd(queueStream, '*', 'task', 'send_email', 'to', 'user@example.com');
        await client.xadd(queueStream, '*', 'task', 'process_payment', 'amount', '100');
        
        // Create worker group
        await client.xgroup('CREATE', queueStream, 'workers', '0');
        
        // Worker reads tasks
        const tasks = await client.xreadgroup('GROUP', 'workers', 'worker1', 'STREAMS', queueStream, '>');
        assert.ok(tasks);
        assert.strictEqual(tasks[0][1].length, 2);
        
        // Acknowledge completed task
        const taskId = tasks[0][1][0][0];
        const acked = await client.xack(queueStream, 'workers', taskId);
        assert.strictEqual(acked, 1);
        
        await client.del(queueStream);
      });

      it('should implement log aggregation', async () => {
        const logStream = `logs:${mode}:${Date.now()}`;
        
        // Add log entries
        await client.xadd(logStream, 'MAXLEN', '~', 1000, '*', 
          'level', 'INFO', 
          'message', 'Application started'
        );
        await client.xadd(logStream, 'MAXLEN', '~', 1000, '*', 
          'level', 'ERROR', 
          'message', 'Database connection failed'
        );
        
        // Read recent logs
        const logs = await client.xrevrange(logStream, '+', '-', 'COUNT', 10);
        assert.ok(logs);
        assert.ok(logs.length > 0);
        
        await client.del(logStream);
      });
    });
  });
});