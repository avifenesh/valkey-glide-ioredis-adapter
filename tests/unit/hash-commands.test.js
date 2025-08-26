"use strict";
/**
 * Hash Commands Behavioral Tests
 * These tests are adapted from ioredis patterns to ensure compatibility
 */
Object.defineProperty(exports, "__esModule", { value: true });
const RedisAdapter_1 = require("../../src/adapters/RedisAdapter");
const setup_1 = require("../setup");
describe('Hash Commands (ioredis compatibility)', () => {
    let redis;
    beforeAll(async () => {
        // Check if test servers are available
        const serversAvailable = await setup_1.testUtils.checkTestServers();
        if (!serversAvailable) {
            console.warn('⚠️  Test servers not available. Please run: ./scripts/start-test-servers.sh');
            console.warn('   Skipping hash command tests...');
        }
    });
    beforeEach(async () => {
        // Skip tests if servers are not available
        const serversAvailable = await setup_1.testUtils.checkTestServers();
        if (!serversAvailable) {
            pending('Test servers not available');
            return;
        }
        // Use test server configuration
        const config = await setup_1.testUtils.getStandaloneConfig();
        redis = new RedisAdapter_1.RedisAdapter(config);
        await redis.connect();
        // Clean up any existing test data
        try {
            await redis.del('myhash', 'nonexistenthash', 'testhash', 'largehash', 'newhash', 'emptyhash');
        }
        catch {
            // Ignore cleanup errors
        }
    });
    afterEach(async () => {
        if (redis) {
            await redis.disconnect();
        }
    });
    describe('HSET and HGET operations', () => {
        test('hset and hget should work with basic field-value pairs', async () => {
            const result = await redis.hset('myhash', 'field1', 'value1');
            expect(result).toBe(1); // Number of fields added
            const value = await redis.hget('myhash', 'field1');
            expect(value).toBe('value1');
        });
        test('hget should return null for non-existent field', async () => {
            await redis.hset('myhash', 'field1', 'value1');
            const value = await redis.hget('myhash', 'nonexistent');
            expect(value).toBeNull();
        });
        test('hget should return null for non-existent hash', async () => {
            const value = await redis.hget('nonexistenthash', 'field1');
            expect(value).toBeNull();
        });
        test('hset should overwrite existing field values', async () => {
            await redis.hset('myhash', 'field1', 'value1');
            const result = await redis.hset('myhash', 'field1', 'newvalue');
            expect(result).toBe(0); // No new fields added, just updated
            const value = await redis.hget('myhash', 'field1');
            expect(value).toBe('newvalue');
        });
        test('hset should accept multiple field-value pairs', async () => {
            // ioredis variadic pattern: redis.hset('hash', 'f1', 'v1', 'f2', 'v2')
            const result = await redis.hset('myhash', 'field1', 'value1', 'field2', 'value2');
            expect(result).toBe(2);
            expect(await redis.hget('myhash', 'field1')).toBe('value1');
            expect(await redis.hget('myhash', 'field2')).toBe('value2');
        });
        test('hset should accept object format', async () => {
            // ioredis object pattern: redis.hset('hash', {field1: 'value1', field2: 'value2'})
            const result = await redis.hset('myhash', { field1: 'value1', field2: 'value2' });
            expect(result).toBe(2);
            expect(await redis.hget('myhash', 'field1')).toBe('value1');
            expect(await redis.hget('myhash', 'field2')).toBe('value2');
        });
    });
    describe('HMSET and HMGET operations', () => {
        test('hmset should set multiple fields at once (variadic)', async () => {
            // ioredis pattern: redis.hmset('hash', 'field1', 'value1', 'field2', 'value2')
            const result = await redis.hmset('myhash', 'field1', 'value1', 'field2', 'value2');
            expect(result).toBe('OK');
            expect(await redis.hget('myhash', 'field1')).toBe('value1');
            expect(await redis.hget('myhash', 'field2')).toBe('value2');
        });
        test('hmset should accept object format', async () => {
            // ioredis pattern: redis.hmset('hash', {field1: 'value1', field2: 'value2'})
            const result = await redis.hmset('myhash', { field1: 'value1', field2: 'value2' });
            expect(result).toBe('OK');
            expect(await redis.hget('myhash', 'field1')).toBe('value1');
            expect(await redis.hget('myhash', 'field2')).toBe('value2');
        });
        test('hmget should return multiple values', async () => {
            await redis.hmset('myhash', 'field1', 'value1', 'field2', 'value2', 'field3', 'value3');
            // ioredis variadic pattern: redis.hmget('hash', 'field1', 'field2')
            const result1 = await redis.hmget('myhash', 'field1', 'field2', 'field3');
            expect(result1).toEqual(['value1', 'value2', 'value3']);
            // ioredis array pattern: redis.hmget('hash', ['field1', 'field2'])
            const result2 = await redis.hmget('myhash', ['field1', 'field2']);
            expect(result2).toEqual(['value1', 'value2']);
        });
        test('hmget should return null for non-existent fields', async () => {
            await redis.hmset('myhash', 'field1', 'value1');
            const result = await redis.hmget('myhash', 'field1', 'nonexistent', 'alsomissing');
            expect(result).toEqual(['value1', null, null]);
        });
        test('hmget should return all nulls for non-existent hash', async () => {
            const result = await redis.hmget('nonexistenthash', 'field1', 'field2');
            expect(result).toEqual([null, null]);
        });
    });
    describe('HGETALL operation', () => {
        test('hgetall should return all field-value pairs', async () => {
            await redis.hmset('myhash', 'field1', 'value1', 'field2', 'value2', 'field3', 'value3');
            const result = await redis.hgetall('myhash');
            expect(result).toEqual({
                field1: 'value1',
                field2: 'value2',
                field3: 'value3'
            });
        });
        test('hgetall should return empty object for non-existent hash', async () => {
            const result = await redis.hgetall('nonexistenthash');
            expect(result).toEqual({});
        });
        test('hgetall should return empty object for empty hash', async () => {
            await redis.hset('emptyhash', 'field1', 'value1');
            await redis.hdel('emptyhash', 'field1');
            const result = await redis.hgetall('emptyhash');
            expect(result).toEqual({});
        });
    });
    describe('Hash field operations', () => {
        test('hdel should delete specified fields', async () => {
            await redis.hmset('myhash', 'field1', 'value1', 'field2', 'value2', 'field3', 'value3');
            // ioredis variadic pattern: redis.hdel('hash', 'field1', 'field2')
            const result = await redis.hdel('myhash', 'field1', 'field3');
            expect(result).toBe(2); // Number of fields deleted
            expect(await redis.hget('myhash', 'field1')).toBeNull();
            expect(await redis.hget('myhash', 'field2')).toBe('value2');
            expect(await redis.hget('myhash', 'field3')).toBeNull();
        });
        test('hdel should return 0 for non-existent fields', async () => {
            await redis.hset('myhash', 'field1', 'value1');
            const result = await redis.hdel('myhash', 'nonexistent1', 'nonexistent2');
            expect(result).toBe(0);
        });
        test('hexists should check field existence', async () => {
            await redis.hset('myhash', 'field1', 'value1');
            expect(await redis.hexists('myhash', 'field1')).toBe(1); // Field exists
            expect(await redis.hexists('myhash', 'nonexistent')).toBe(0); // Field doesn't exist
            expect(await redis.hexists('nonexistenthash', 'field1')).toBe(0); // Hash doesn't exist
        });
        test('hkeys should return all field names', async () => {
            await redis.hmset('myhash', 'field1', 'value1', 'field2', 'value2', 'field3', 'value3');
            const keys = await redis.hkeys('myhash');
            expect(keys.sort()).toEqual(['field1', 'field2', 'field3']);
        });
        test('hkeys should return empty array for non-existent hash', async () => {
            const keys = await redis.hkeys('nonexistenthash');
            expect(keys).toEqual([]);
        });
        test('hvals should return all field values', async () => {
            await redis.hmset('myhash', 'field1', 'value1', 'field2', 'value2', 'field3', 'value3');
            const values = await redis.hvals('myhash');
            expect(values.sort()).toEqual(['value1', 'value2', 'value3']);
        });
        test('hvals should return empty array for non-existent hash', async () => {
            const values = await redis.hvals('nonexistenthash');
            expect(values).toEqual([]);
        });
        test('hlen should return number of fields', async () => {
            await redis.hmset('myhash', 'field1', 'value1', 'field2', 'value2');
            const length = await redis.hlen('myhash');
            expect(length).toBe(2);
        });
        test('hlen should return 0 for non-existent hash', async () => {
            const length = await redis.hlen('nonexistenthash');
            expect(length).toBe(0);
        });
    });
    describe('Hash increment operations', () => {
        test('hincrby should increment numeric field value', async () => {
            await redis.hset('myhash', 'counter', '10');
            const result = await redis.hincrby('myhash', 'counter', 5);
            expect(result).toBe(15);
            expect(await redis.hget('myhash', 'counter')).toBe('15');
        });
        test('hincrby should initialize field to increment value for non-existent field', async () => {
            const result = await redis.hincrby('myhash', 'newcounter', 5);
            expect(result).toBe(5);
            expect(await redis.hget('myhash', 'newcounter')).toBe('5');
        });
        test('hincrbyfloat should increment float field value', async () => {
            await redis.hset('myhash', 'float_counter', '10.5');
            const result = await redis.hincrbyfloat('myhash', 'float_counter', 2.3);
            expect(result).toBe(12.8);
            expect(await redis.hget('myhash', 'float_counter')).toBe('12.8');
        });
        test('hincrby should throw error for non-numeric field', async () => {
            await redis.hset('myhash', 'text_field', 'not_a_number');
            await expect(redis.hincrby('myhash', 'text_field', 1)).rejects.toThrow();
        });
    });
    describe('Conditional hash operations', () => {
        test('hsetnx should set field only if it does not exist', async () => {
            const result1 = await redis.hsetnx('myhash', 'field1', 'value1');
            expect(result1).toBe(1); // Field was set
            const result2 = await redis.hsetnx('myhash', 'field1', 'value2');
            expect(result2).toBe(0); // Field was not set because it exists
            expect(await redis.hget('myhash', 'field1')).toBe('value1');
        });
        test('hsetnx should work on non-existent hash', async () => {
            const result = await redis.hsetnx('newhash', 'field1', 'value1');
            expect(result).toBe(1);
            expect(await redis.hget('newhash', 'field1')).toBe('value1');
        });
    });
    describe('Edge cases and error handling', () => {
        test('operations should handle large hash sizes', async () => {
            const fields = {};
            for (let i = 0; i < 100; i++) {
                fields[`field${i}`] = `value${i}`;
            }
            await redis.hmset('largehash', fields);
            const result = await redis.hgetall('largehash');
            expect(Object.keys(result)).toHaveLength(100);
        });
        test('operations should handle empty field names', async () => {
            await redis.hset('myhash', '', 'empty_field_value');
            expect(await redis.hget('myhash', '')).toBe('empty_field_value');
        });
        test('operations should handle special characters in field names', async () => {
            const specialField = 'field:with:colons:and:unicode:🚀';
            await redis.hset('myhash', specialField, 'special_value');
            expect(await redis.hget('myhash', specialField)).toBe('special_value');
        });
        test('operations should handle large field values', async () => {
            const largeValue = 'x'.repeat(10000);
            await redis.hset('myhash', 'largefield', largeValue);
            expect(await redis.hget('myhash', 'largefield')).toBe(largeValue);
        });
    });
});
//# sourceMappingURL=hash-commands.test.js.map