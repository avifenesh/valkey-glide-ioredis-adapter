/**
 * Enhanced Stream Commands Tests
 * Comprehensive tests for Redis Streams functionality
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import pkg from "../../dist/index.js";
const { Redis } = pkg;

describe('Enhanced Stream Commands', () => {
  let client;
  const streamKey = 'test:stream';

  beforeEach(async () => {
    client = new Redis({
      host: process.env.VALKEY_HOST || 'localhost',
      port: parseInt(process.env.VALKEY_PORT || '6379'),
    });
    await client.connect();
    await client.flushdb();
  });

  afterEach(async () => {
    if (client) {
      await client.flushdb();
      await client.disconnect();
    }
  });

  describe('XADD - Adding entries', () => {
    it('should add entry with auto-generated ID', async () => {
      const id = await client.xadd(streamKey, '*', 'field1', 'value1');
      assert.ok(id);
      assert.ok(id.includes('-'));
      
      const parts = id.split('-');
      assert.strictEqual(parts.length, 2);
      assert.ok(parseInt(parts[0]) > 0);
      assert.ok(parseInt(parts[1]) >= 0);
    });

    it('should add entry with explicit ID', async () => {
      const explicitId = '1000-0';
      const id = await client.xadd(streamKey, explicitId, 'field1', 'value1');
      assert.strictEqual(id, explicitId);
    });

    it('should add multiple field-value pairs', async () => {
      const id = await client.xadd(streamKey, '*', 
        'name', 'John',
        'age', '30',
        'city', 'New York'
      );
      assert.ok(id);
      
      const entries = await client.xrange(streamKey, '-', '+');
      assert.strictEqual(entries.length, 1);
      assert.deepStrictEqual(entries[0][1], ['name', 'John', 'age', '30', 'city', 'New York']);
    });

    it('should handle MAXLEN option', async () => {
      // Add multiple entries
      for (let i = 0; i < 10; i++) {
        await client.xadd(streamKey, '*', 'value', `item${i}`);
      }
      
      // Add with MAXLEN
      await client.xadd(streamKey, 'MAXLEN', 5, '*', 'value', 'item10');
      
      const length = await client.xlen(streamKey);
      assert.ok(length <= 6); // Approximate trimming might keep slightly more
    });

    it('should handle MAXLEN with exact trimming', async () => {
      // Add multiple entries
      for (let i = 0; i < 10; i++) {
        await client.xadd(streamKey, '*', 'value', `item${i}`);
      }
      
      // Add with exact MAXLEN
      await client.xadd(streamKey, 'MAXLEN', '=', 5, '*', 'value', 'item10');
      
      const length = await client.xlen(streamKey);
      assert.strictEqual(length, 5);
    });

    it('should handle MINID option', async () => {
      // Add entries with specific IDs
      await client.xadd(streamKey, '1000-0', 'value', 'old1');
      await client.xadd(streamKey, '2000-0', 'value', 'old2');
      await client.xadd(streamKey, '3000-0', 'value', 'keep1');
      await client.xadd(streamKey, '4000-0', 'value', 'keep2');
      
      // Add with MINID
      await client.xadd(streamKey, 'MINID', '3000-0', '*', 'value', 'new');
      
      const entries = await client.xrange(streamKey, '-', '+');
      assert.ok(entries.every(e => parseInt(e[0].split('-')[0]) >= 3000));
    });

    it('should handle NOMKSTREAM option', async () => {
      // Try to add to non-existent stream with NOMKSTREAM
      const result = await client.xadd('nonexistent:stream', 'NOMKSTREAM', '*', 'field', 'value');
      assert.strictEqual(result, null);
      
      // Verify stream wasn't created
      const exists = await client.exists('nonexistent:stream');
      assert.strictEqual(exists, 0);
    });

    it('should handle LIMIT option with trimming', async () => {
      // Add many entries
      for (let i = 0; i < 100; i++) {
        await client.xadd(streamKey, '*', 'value', `item${i}`);
      }
      
      // Add with MAXLEN and LIMIT
      await client.xadd(streamKey, 'MAXLEN', '~', 10, 'LIMIT', 5, '*', 'value', 'new');
      
      const length = await client.xlen(streamKey);
      assert.ok(length > 10); // LIMIT prevents aggressive trimming
    });

    it('should reject invalid IDs', async () => {
      await client.xadd(streamKey, '1000-0', 'field', 'value');
      
      try {
        await client.xadd(streamKey, '999-0', 'field', 'value');
        assert.fail('Should have rejected ID in the past');
      } catch (err) {
        assert.ok(err);
        assert.ok(err.message.includes('ID') || err.message.includes('equal or smaller'));
      }
    });
  });

  describe('XREAD - Reading entries', () => {
    beforeEach(async () => {
      // Add test entries
      await client.xadd(streamKey, '1000-0', 'msg', 'first');
      await client.xadd(streamKey, '2000-0', 'msg', 'second');
      await client.xadd(streamKey, '3000-0', 'msg', 'third');
    });

    it('should read from single stream', async () => {
      const result = await client.xread('STREAMS', streamKey, '0');
      
      assert.ok(Array.isArray(result));
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0][0], streamKey);
      assert.strictEqual(result[0][1].length, 3);
    });

    it('should read from specific ID', async () => {
      const result = await client.xread('STREAMS', streamKey, '1000-0');
      
      assert.strictEqual(result[0][1].length, 2); // Should get second and third
      assert.strictEqual(result[0][1][0][0], '2000-0');
      assert.strictEqual(result[0][1][1][0], '3000-0');
    });

    it('should read with COUNT limit', async () => {
      const result = await client.xread('COUNT', 2, 'STREAMS', streamKey, '0');
      
      assert.strictEqual(result[0][1].length, 2);
    });

    it('should read from multiple streams', async () => {
      const stream2 = 'test:stream2';
      await client.xadd(stream2, '1500-0', 'msg', 'other');
      
      const result = await client.xread('STREAMS', streamKey, stream2, '0', '0');
      
      assert.strictEqual(result.length, 2);
      assert.ok(result.find(s => s[0] === streamKey));
      assert.ok(result.find(s => s[0] === stream2));
    });

    it('should handle BLOCK option with immediate data', async () => {
      const result = await client.xread('BLOCK', 100, 'STREAMS', streamKey, '0');
      
      assert.ok(result);
      assert.strictEqual(result[0][1].length, 3);
    });

    it('should handle BLOCK timeout', async () => {
      const start = Date.now();
      const result = await client.xread('BLOCK', 100, 'STREAMS', streamKey, '$');
      const elapsed = Date.now() - start;
      
      assert.strictEqual(result, null);
      assert.ok(elapsed >= 90); // Allow some variance
    });

    it('should read only new entries with $', async () => {
      // Create a second client for adding messages
      const client2 = new Redis({
        host: process.env.VALKEY_HOST || 'localhost',
        port: parseInt(process.env.VALKEY_PORT || '6379'),
      });
      await client2.connect();
      
      // Start reading from current end
      const promise = client.xread('BLOCK', 2000, 'STREAMS', streamKey, '$');
      
      // Add new entry after a delay using second client
      setTimeout(async () => {
        await client2.xadd(streamKey, '*', 'msg', 'new');
      }, 100);
      
      const result = await promise;
      assert.ok(result);
      assert.strictEqual(result[0][1].length, 1);
      assert.strictEqual(result[0][1][0][1][1], 'new');
      
      await client2.quit();
    });
  });

  describe('XRANGE and XREVRANGE', () => {
    beforeEach(async () => {
      await client.xadd(streamKey, '1000-0', 'value', 'a');
      await client.xadd(streamKey, '2000-0', 'value', 'b');
      await client.xadd(streamKey, '3000-0', 'value', 'c');
      await client.xadd(streamKey, '4000-0', 'value', 'd');
      await client.xadd(streamKey, '5000-0', 'value', 'e');
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
      assert.strictEqual(entries[1][0], '4000-0');
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
      const length = await client.xlen(streamKey);
      assert.strictEqual(length, 0);
    });

    it('should return correct length', async () => {
      await client.xadd(streamKey, '*', 'field', 'value1');
      await client.xadd(streamKey, '*', 'field', 'value2');
      await client.xadd(streamKey, '*', 'field', 'value3');
      
      const length = await client.xlen(streamKey);
      assert.strictEqual(length, 3);
    });

    it('should handle non-existent stream', async () => {
      const length = await client.xlen('nonexistent:stream');
      assert.strictEqual(length, 0);
    });
  });

  describe('XDEL - Deleting entries', () => {
    beforeEach(async () => {
      await client.xadd(streamKey, '1000-0', 'field', 'value1');
      await client.xadd(streamKey, '2000-0', 'field', 'value2');
      await client.xadd(streamKey, '3000-0', 'field', 'value3');
    });

    it('should delete single entry', async () => {
      const deleted = await client.xdel(streamKey, '2000-0');
      assert.strictEqual(deleted, 1);
      
      const entries = await client.xrange(streamKey, '-', '+');
      assert.strictEqual(entries.length, 2);
      assert.ok(!entries.find(e => e[0] === '2000-0'));
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
      const deleted = await client.xdel(streamKey, '1000-0', '9999-0', '2000-0');
      assert.strictEqual(deleted, 2);
    });
  });

  describe('XTRIM - Trimming streams', () => {
    beforeEach(async () => {
      for (let i = 0; i < 10; i++) {
        await client.xadd(streamKey, `${1000 + i * 1000}-0`, 'value', `item${i}`);
      }
    });

    it('should trim with MAXLEN', async () => {
      const trimmed = await client.xtrim(streamKey, 'MAXLEN', 5);
      assert.ok(trimmed >= 5);
      
      const length = await client.xlen(streamKey);
      assert.strictEqual(length, 5);
    });

    it('should trim with exact MAXLEN', async () => {
      const trimmed = await client.xtrim(streamKey, 'MAXLEN', '=', 3);
      assert.strictEqual(trimmed, 7);
      
      const length = await client.xlen(streamKey);
      assert.strictEqual(length, 3);
    });

    it('should trim with approximate MAXLEN', async () => {
      const trimmed = await client.xtrim(streamKey, 'MAXLEN', '~', 5);
      
      const length = await client.xlen(streamKey);
      assert.ok(length >= 5);
      assert.ok(length <= 10);
    });

    it('should trim with MINID', async () => {
      const trimmed = await client.xtrim(streamKey, 'MINID', '5000-0');
      
      const entries = await client.xrange(streamKey, '-', '+');
      assert.ok(entries.every(e => parseInt(e[0].split('-')[0]) >= 5000));
    });

    it('should trim with LIMIT option', async () => {
      const trimmed = await client.xtrim(streamKey, 'MAXLEN', '~', 5, 'LIMIT', 3);
      
      // LIMIT restricts how many entries can be deleted
      assert.ok(trimmed <= 3);
    });
  });

  describe('Consumer Groups', () => {
    describe('XGROUP CREATE', () => {
      it('should create consumer group', async () => {
        await client.xadd(streamKey, '*', 'field', 'value');
        const result = await client.xgroup('CREATE', streamKey, 'mygroup', '$');
        assert.strictEqual(result, 'OK');
      });

      it('should create group at specific ID', async () => {
        await client.xadd(streamKey, '1000-0', 'field', 'value1');
        await client.xadd(streamKey, '2000-0', 'field', 'value2');
        
        const result = await client.xgroup('CREATE', streamKey, 'mygroup', '1000-0');
        assert.strictEqual(result, 'OK');
      });

      it('should create group from beginning', async () => {
        await client.xadd(streamKey, '*', 'field', 'value');
        const result = await client.xgroup('CREATE', streamKey, 'mygroup', '0');
        assert.strictEqual(result, 'OK');
      });

      it('should handle MKSTREAM option', async () => {
        const result = await client.xgroup('CREATE', 'new:stream', 'mygroup', '$', 'MKSTREAM');
        assert.strictEqual(result, 'OK');
        
        const exists = await client.exists('new:stream');
        assert.strictEqual(exists, 1);
      });

      it('should fail on duplicate group', async () => {
        await client.xadd(streamKey, '*', 'field', 'value');
        await client.xgroup('CREATE', streamKey, 'mygroup', '$');
        
        try {
          await client.xgroup('CREATE', streamKey, 'mygroup', '$');
          assert.fail('Should have failed on duplicate group');
        } catch (err) {
          assert.ok(err);
          assert.ok(err.message.includes('BUSYGROUP') || err.message.includes('already exists'));
        }
      });
    });

    describe('XGROUP DESTROY', () => {
      it('should destroy consumer group', async () => {
        await client.xadd(streamKey, '*', 'field', 'value');
        await client.xgroup('CREATE', streamKey, 'mygroup', '$');
        
        const result = await client.xgroup('DESTROY', streamKey, 'mygroup');
        assert.strictEqual(result, 1);
      });

      it('should return 0 for non-existent group', async () => {
        await client.xadd(streamKey, '*', 'field', 'value');
        const result = await client.xgroup('DESTROY', streamKey, 'nonexistent');
        assert.strictEqual(result, 0);
      });
    });

    describe('XGROUP CREATECONSUMER', () => {
      it('should create consumer', async () => {
        await client.xadd(streamKey, '*', 'field', 'value');
        await client.xgroup('CREATE', streamKey, 'mygroup', '$');
        
        const result = await client.xgroup('CREATECONSUMER', streamKey, 'mygroup', 'consumer1');
        assert.strictEqual(result, 1);
      });

      it('should return 0 for existing consumer', async () => {
        await client.xadd(streamKey, '*', 'field', 'value');
        await client.xgroup('CREATE', streamKey, 'mygroup', '$');
        await client.xgroup('CREATECONSUMER', streamKey, 'mygroup', 'consumer1');
        
        const result = await client.xgroup('CREATECONSUMER', streamKey, 'mygroup', 'consumer1');
        assert.strictEqual(result, 0);
      });
    });

    describe('XGROUP DELCONSUMER', () => {
      it('should delete consumer', async () => {
        await client.xadd(streamKey, '*', 'field', 'value');
        await client.xgroup('CREATE', streamKey, 'mygroup', '$');
        await client.xgroup('CREATECONSUMER', streamKey, 'mygroup', 'consumer1');
        
        const result = await client.xgroup('DELCONSUMER', streamKey, 'mygroup', 'consumer1');
        assert.ok(result >= 0);
      });
    });

    describe('XGROUP SETID', () => {
      it('should set group ID', async () => {
        await client.xadd(streamKey, '1000-0', 'field', 'value1');
        await client.xadd(streamKey, '2000-0', 'field', 'value2');
        await client.xgroup('CREATE', streamKey, 'mygroup', '0');
        
        const result = await client.xgroup('SETID', streamKey, 'mygroup', '2000-0');
        assert.strictEqual(result, 'OK');
      });

      it('should set ID to $', async () => {
        await client.xadd(streamKey, '*', 'field', 'value');
        await client.xgroup('CREATE', streamKey, 'mygroup', '0');
        
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
        const result = await client.xreadgroup('GROUP', 'mygroup', 'consumer1', 'STREAMS', streamKey, '>');
        
        assert.ok(result);
        assert.strictEqual(result[0][0], streamKey);
        assert.strictEqual(result[0][1].length, 3);
      });

      it('should read with COUNT limit', async () => {
        const result = await client.xreadgroup('GROUP', 'mygroup', 'consumer1', 'COUNT', 2, 'STREAMS', streamKey, '>');
        
        assert.strictEqual(result[0][1].length, 2);
      });

      it('should handle BLOCK option', async () => {
        // First read all messages
        await client.xreadgroup('GROUP', 'mygroup', 'consumer1', 'STREAMS', streamKey, '>');
        
        // Now block for new messages
        const start = Date.now();
        const result = await client.xreadgroup('GROUP', 'mygroup', 'consumer1', 'BLOCK', 100, 'STREAMS', streamKey, '>');
        const elapsed = Date.now() - start;
        
        assert.strictEqual(result, null);
        assert.ok(elapsed >= 90);
      });

      it('should handle NOACK option', async () => {
        const result = await client.xreadgroup('GROUP', 'mygroup', 'consumer1', 'NOACK', 'STREAMS', streamKey, '>');
        
        assert.ok(result);
        // Messages read with NOACK don't require acknowledgment
      });

      it('should read pending messages', async () => {
        // Read messages but don't ACK
        await client.xreadgroup('GROUP', 'mygroup', 'consumer1', 'COUNT', 2, 'STREAMS', streamKey, '>');
        
        // Read pending messages
        const pending = await client.xreadgroup('GROUP', 'mygroup', 'consumer1', 'STREAMS', streamKey, '0');
        
        assert.ok(pending);
        assert.strictEqual(pending[0][1].length, 2);
      });
    });

    describe('XACK', () => {
      beforeEach(async () => {
        await client.xadd(streamKey, '1000-0', 'msg', 'first');
        await client.xadd(streamKey, '2000-0', 'msg', 'second');
        await client.xgroup('CREATE', streamKey, 'mygroup', '0');
      });

      it('should acknowledge single message', async () => {
        // Read message
        const messages = await client.xreadgroup('GROUP', 'mygroup', 'consumer1', 'STREAMS', streamKey, '>');
        const messageId = messages[0][1][0][0];
        
        // Acknowledge
        const acked = await client.xack(streamKey, 'mygroup', messageId);
        assert.strictEqual(acked, 1);
      });

      it('should acknowledge multiple messages', async () => {
        // Read messages
        const messages = await client.xreadgroup('GROUP', 'mygroup', 'consumer1', 'STREAMS', streamKey, '>');
        const ids = messages[0][1].map(m => m[0]);
        
        // Acknowledge all
        const acked = await client.xack(streamKey, 'mygroup', ...ids);
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
      });

      it('should get pending summary', async () => {
        // Read but don't ACK
        await client.xreadgroup('GROUP', 'mygroup', 'consumer1', 'COUNT', 2, 'STREAMS', streamKey, '>');
        
        const pending = await client.xpending(streamKey, 'mygroup');
        
        assert.ok(Array.isArray(pending));
        assert.strictEqual(pending[0], 2); // Total pending
        assert.ok(pending[1]); // Min ID
        assert.ok(pending[2]); // Max ID
        assert.ok(Array.isArray(pending[3])); // Consumer list
      });

      it('should get detailed pending with range', async () => {
        await client.xreadgroup('GROUP', 'mygroup', 'consumer1', 'STREAMS', streamKey, '>');
        
        const pending = await client.xpending(streamKey, 'mygroup', '-', '+', 10);
        
        assert.ok(Array.isArray(pending));
        assert.strictEqual(pending.length, 3);
        // Each entry: [id, consumer, idle_time, delivery_count]
        assert.ok(pending[0][0]); // ID
        assert.strictEqual(pending[0][1], 'consumer1'); // Consumer
      });

      it('should filter by consumer', async () => {
        await client.xreadgroup('GROUP', 'mygroup', 'consumer1', 'COUNT', 1, 'STREAMS', streamKey, '>');
        await client.xreadgroup('GROUP', 'mygroup', 'consumer2', 'COUNT', 1, 'STREAMS', streamKey, '>');
        
        const pending = await client.xpending(streamKey, 'mygroup', '-', '+', 10, 'consumer1');
        
        assert.strictEqual(pending.length, 1);
        assert.strictEqual(pending[0][1], 'consumer1');
      });
    });

    describe('XCLAIM', () => {
      beforeEach(async () => {
        await client.xadd(streamKey, '1000-0', 'msg', 'first');
        await client.xadd(streamKey, '2000-0', 'msg', 'second');
        await client.xgroup('CREATE', streamKey, 'mygroup', '0');
      });

      it('should claim messages', async () => {
        // Consumer1 reads
        const messages = await client.xreadgroup('GROUP', 'mygroup', 'consumer1', 'STREAMS', streamKey, '>');
        const messageId = messages[0][1][0][0];
        
        // Wait a bit
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Consumer2 claims
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
        const claimed = await client.xclaim(streamKey, 'mygroup', 'consumer2', 0, '1000-0', 'FORCE');
        
        assert.ok(Array.isArray(claimed));
        assert.strictEqual(claimed.length, 1);
      });
    });

    describe('XAUTOCLAIM', () => {
      beforeEach(async () => {
        await client.xadd(streamKey, '1000-0', 'msg', 'first');
        await client.xadd(streamKey, '2000-0', 'msg', 'second');
        await client.xgroup('CREATE', streamKey, 'mygroup', '0');
      });

      it('should auto-claim idle messages', async () => {
        // Consumer1 reads
        await client.xreadgroup('GROUP', 'mygroup', 'consumer1', 'STREAMS', streamKey, '>');
        
        // Wait for messages to become idle
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Auto-claim for consumer2
        const result = await client.xautoclaim(streamKey, 'mygroup', 'consumer2', 10, '0-0');
        
        assert.ok(Array.isArray(result));
        assert.ok(result[0]); // Next ID
        assert.ok(Array.isArray(result[1])); // Claimed messages
      });

      it('should handle COUNT option', async () => {
        await client.xreadgroup('GROUP', 'mygroup', 'consumer1', 'STREAMS', streamKey, '>');
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const result = await client.xautoclaim(streamKey, 'mygroup', 'consumer2', 10, '0-0', 'COUNT', 1);
        
        assert.ok(result[1].length <= 1);
      });

      it('should handle JUSTID option', async () => {
        await client.xreadgroup('GROUP', 'mygroup', 'consumer1', 'STREAMS', streamKey, '>');
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const result = await client.xautoclaim(streamKey, 'mygroup', 'consumer2', 10, '0-0', 'JUSTID');
        
        assert.ok(Array.isArray(result));
        assert.ok(result[0]); // Next ID
        assert.ok(Array.isArray(result[1])); // Just IDs
        if (result[1].length > 0) {
          assert.ok(typeof result[1][0] === 'string'); // Should be ID string
        }
      });
    });
  });

  describe('XINFO', () => {
    beforeEach(async () => {
      await client.xadd(streamKey, '1000-0', 'field', 'value1');
      await client.xadd(streamKey, '2000-0', 'field', 'value2');
      await client.xgroup('CREATE', streamKey, 'group1', '0');
      await client.xgroup('CREATE', streamKey, 'group2', '$');
    });

    it('should get stream info', async () => {
      const info = await client.xinfo('STREAM', streamKey);
      
      assert.ok(Array.isArray(info));
      // Info contains: length, radix-tree-keys, radix-tree-nodes, groups, last-generated-id, etc.
      const infoObj = {};
      for (let i = 0; i < info.length; i += 2) {
        infoObj[info[i]] = info[i + 1];
      }
      
      assert.strictEqual(infoObj.length, 2);
      assert.ok(infoObj['last-generated-id']);
      assert.strictEqual(infoObj.groups, 2);
    });

    it('should get groups info', async () => {
      const groups = await client.xinfo('GROUPS', streamKey);
      
      assert.ok(Array.isArray(groups));
      assert.strictEqual(groups.length, 2);
      
      // Each group info is an array of key-value pairs
      const group1 = {};
      for (let i = 0; i < groups[0].length; i += 2) {
        group1[groups[0][i]] = groups[0][i + 1];
      }
      
      assert.ok(group1.name === 'group1' || group1.name === 'group2');
      assert.ok(group1.hasOwnProperty('consumers'));
      assert.ok(group1.hasOwnProperty('pending'));
    });

    it('should get consumers info', async () => {
      // Create consumers by reading
      await client.xreadgroup('GROUP', 'group1', 'consumer1', 'COUNT', 1, 'STREAMS', streamKey, '>');
      await client.xreadgroup('GROUP', 'group1', 'consumer2', 'COUNT', 1, 'STREAMS', streamKey, '>');
      
      const consumers = await client.xinfo('CONSUMERS', streamKey, 'group1');
      
      assert.ok(Array.isArray(consumers));
      assert.strictEqual(consumers.length, 2);
      
      const consumer1 = {};
      for (let i = 0; i < consumers[0].length; i += 2) {
        consumer1[consumers[0][i]] = consumers[0][i + 1];
      }
      
      assert.ok(consumer1.name === 'consumer1' || consumer1.name === 'consumer2');
      assert.ok(consumer1.hasOwnProperty('pending'));
    });
  });

  describe('Real-world Stream Use Cases', () => {
    it('should implement event sourcing pattern', async () => {
      const eventStream = 'events:user:123';
      
      // Add events
      await client.xadd(eventStream, '*', 'type', 'created', 'name', 'John');
      await client.xadd(eventStream, '*', 'type', 'updated', 'email', 'john@example.com');
      await client.xadd(eventStream, '*', 'type', 'updated', 'age', '30');
      
      // Read all events to reconstruct state
      const events = await client.xrange(eventStream, '-', '+');
      
      const state = { type: 'user' };
      for (const [id, fields] of events) {
        const event = {};
        for (let i = 0; i < fields.length; i += 2) {
          event[fields[i]] = fields[i + 1];
        }
        
        if (event.type === 'created') {
          state.name = event.name;
        } else if (event.type === 'updated') {
          Object.assign(state, event);
          delete state.type;
        }
      }
      
      assert.strictEqual(state.name, 'John');
      assert.strictEqual(state.email, 'john@example.com');
      assert.strictEqual(state.age, '30');
    });

    it('should implement message queue with consumer groups', async () => {
      const queueStream = 'task:queue';
      
      // Producer adds tasks
      const taskIds = [];
      for (let i = 0; i < 5; i++) {
        const id = await client.xadd(queueStream, '*', 'task', `process_${i}`, 'priority', i % 2 ? 'high' : 'low');
        taskIds.push(id);
      }
      
      // Create consumer group
      await client.xgroup('CREATE', queueStream, 'workers', '0');
      
      // Worker 1 processes tasks
      const worker1Tasks = await client.xreadgroup('GROUP', 'workers', 'worker1', 'COUNT', 2, 'STREAMS', queueStream, '>');
      assert.strictEqual(worker1Tasks[0][1].length, 2);
      
      // Worker 2 processes tasks
      const worker2Tasks = await client.xreadgroup('GROUP', 'workers', 'worker2', 'COUNT', 2, 'STREAMS', queueStream, '>');
      assert.strictEqual(worker2Tasks[0][1].length, 2);
      
      // Acknowledge completed tasks
      const worker1Ids = worker1Tasks[0][1].map(t => t[0]);
      const acked = await client.xack(queueStream, 'workers', ...worker1Ids);
      assert.strictEqual(acked, 2);
      
      // Check pending tasks
      const pending = await client.xpending(queueStream, 'workers');
      assert.strictEqual(pending[0], 2); // Worker2's tasks are still pending
    });

    it('should implement log aggregation', async () => {
      const logStream = 'logs:application';
      
      // Add log entries from multiple sources
      await client.xadd(logStream, '*', 'level', 'INFO', 'service', 'api', 'message', 'Request received');
      await client.xadd(logStream, '*', 'level', 'ERROR', 'service', 'db', 'message', 'Connection failed');
      await client.xadd(logStream, '*', 'level', 'WARN', 'service', 'api', 'message', 'Slow response');
      
      // Query logs by time range
      const now = Date.now();
      const logs = await client.xrange(logStream, now - 60000, now);
      
      // Filter ERROR logs
      const errors = logs.filter(([id, fields]) => {
        for (let i = 0; i < fields.length; i += 2) {
          if (fields[i] === 'level' && fields[i + 1] === 'ERROR') {
            return true;
          }
        }
        return false;
      });
      
      assert.ok(errors.length > 0);
    });
  });
});
