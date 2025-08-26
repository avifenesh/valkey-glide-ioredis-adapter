"use strict";
/**
 * String Commands Behavioral Tests
 * These tests are adapted from ioredis patterns to ensure compatibility
 */
Object.defineProperty(exports, "__esModule", { value: true });
const RedisAdapter_1 = require("../../src/adapters/RedisAdapter");
const setup_1 = require("../setup");
describe('String Commands (ioredis compatibility)', () => {
    let redis;
    beforeAll(async () => {
        // Check if test servers are available
        const serversAvailable = await setup_1.testUtils.checkTestServers();
        if (!serversAvailable) {
            console.warn('⚠️  Test servers not available. Please run: ./scripts/start-test-servers.sh');
            console.warn('   Skipping integration tests...');
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
            await redis.del('foo', 'key', 'newkey', 'key1', 'key2', 'key3', 'counter', 'newcounter', 'float_counter', 'mykey', 'largekey', 'tempkey', 'textkey', 'nonexistent', 'existing', 'newkey', 'number', 'text');
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
    describe('GET and SET operations', () => {
        test('set and get should work with basic string values', async () => {
            // Basic SET/GET - most common pattern
            await redis.set('foo', 'bar');
            expect(await redis.get('foo')).toBe('bar');
        });
        test('get should return null for non-existent keys', async () => {
            expect(await redis.get('nonexistent')).toBeNull();
        });
        test('set should overwrite existing values', async () => {
            await redis.set('key', 'value1');
            await redis.set('key', 'value2');
            expect(await redis.get('key')).toBe('value2');
        });
        test('set with expiration using EX option', async () => {
            // ioredis pattern: redis.set('key', 'value', 'EX', 1)
            await redis.set('foo', 'bar', 'EX', 1);
            expect(await redis.get('foo')).toBe('bar');
            // Wait for expiration
            await setup_1.testUtils.delay(1100);
            expect(await redis.get('foo')).toBeNull();
        });
        test('set with expiration using PX option', async () => {
            // ioredis pattern: redis.set('key', 'value', 'PX', 500)
            await redis.set('foo', 'bar', 'PX', 500);
            expect(await redis.get('foo')).toBe('bar');
            await setup_1.testUtils.delay(600);
            expect(await redis.get('foo')).toBeNull();
        });
        test('set with NX option (only if not exists)', async () => {
            // ioredis pattern: redis.set('key', 'value', 'NX')
            await redis.set('foo', 'bar');
            const result = await redis.set('foo', 'new_value', 'NX');
            expect(result).toBeNull(); // Should fail because key exists
            expect(await redis.get('foo')).toBe('bar'); // Value unchanged
        });
        test('set with XX option (only if exists)', async () => {
            // ioredis pattern: redis.set('key', 'value', 'XX')
            const result1 = await redis.set('nonexistent', 'value', 'XX');
            expect(result1).toBeNull(); // Should fail because key doesn't exist
            await redis.set('existing', 'old_value');
            const result2 = await redis.set('existing', 'new_value', 'XX');
            expect(result2).toBe('OK');
            expect(await redis.get('existing')).toBe('new_value');
        });
        test('set with combined options EX and NX', async () => {
            // ioredis pattern: redis.set('key', 'value', 'EX', 60, 'NX')
            const result1 = await redis.set('newkey', 'value', 'EX', 1, 'NX');
            expect(result1).toBe('OK');
            const result2 = await redis.set('newkey', 'other', 'EX', 1, 'NX');
            expect(result2).toBeNull(); // Should fail due to NX
        });
    });
    describe('MGET and MSET operations', () => {
        test('mset should set multiple keys at once', async () => {
            // ioredis variadic pattern: redis.mset('key1', 'val1', 'key2', 'val2')
            await redis.mset('key1', 'val1', 'key2', 'val2', 'key3', 'val3');
            expect(await redis.get('key1')).toBe('val1');
            expect(await redis.get('key2')).toBe('val2');
            expect(await redis.get('key3')).toBe('val3');
        });
        test('mset should accept object format', async () => {
            // ioredis object pattern: redis.mset({key1: 'val1', key2: 'val2'})
            await redis.mset({ key1: 'val1', key2: 'val2' });
            expect(await redis.get('key1')).toBe('val1');
            expect(await redis.get('key2')).toBe('val2');
        });
        test('mget should return multiple values', async () => {
            await redis.mset('key1', 'val1', 'key2', 'val2', 'key3', 'val3');
            // ioredis variadic pattern: redis.mget('key1', 'key2', 'key3')
            const result1 = await redis.mget('key1', 'key2', 'key3');
            expect(result1).toEqual(['val1', 'val2', 'val3']);
            // ioredis array pattern: redis.mget(['key1', 'key2', 'key3'])
            const result2 = await redis.mget(['key1', 'key2', 'key3']);
            expect(result2).toEqual(['val1', 'val2', 'val3']);
        });
        test('mget should return null for non-existent keys', async () => {
            await redis.set('existing', 'value');
            const result = await redis.mget('existing', 'nonexistent', 'alsonothere');
            expect(result).toEqual(['value', null, null]);
        });
    });
    describe('Increment and Decrement operations', () => {
        test('incr should increment by 1', async () => {
            await redis.set('counter', '10');
            const result = await redis.incr('counter');
            expect(result).toBe(11);
            expect(await redis.get('counter')).toBe('11');
        });
        test('incr should initialize to 1 for non-existent key', async () => {
            const result = await redis.incr('newcounter');
            expect(result).toBe(1);
        });
        test('incrby should increment by specified amount', async () => {
            await redis.set('counter', '10');
            const result = await redis.incrby('counter', 5);
            expect(result).toBe(15);
        });
        test('decr should decrement by 1', async () => {
            await redis.set('counter', '10');
            const result = await redis.decr('counter');
            expect(result).toBe(9);
        });
        test('decrby should decrement by specified amount', async () => {
            await redis.set('counter', '10');
            const result = await redis.decrby('counter', 3);
            expect(result).toBe(7);
        });
        test('incrbyfloat should handle float values', async () => {
            await redis.set('float_counter', '10.5');
            const result = await redis.incrbyfloat('float_counter', 2.3);
            expect(result).toBe(12.8);
        });
    });
    describe('String manipulation operations', () => {
        test('append should append to existing string', async () => {
            await redis.set('mykey', 'Hello');
            const length = await redis.append('mykey', ' World');
            expect(length).toBe(11);
            expect(await redis.get('mykey')).toBe('Hello World');
        });
        test('append should set value for non-existent key', async () => {
            const length = await redis.append('newkey', 'Hello');
            expect(length).toBe(5);
            expect(await redis.get('newkey')).toBe('Hello');
        });
        test('strlen should return string length', async () => {
            await redis.set('mykey', 'Hello World');
            const length = await redis.strlen('mykey');
            expect(length).toBe(11);
        });
        test('strlen should return 0 for non-existent key', async () => {
            const length = await redis.strlen('nonexistent');
            expect(length).toBe(0);
        });
        test('getrange should return substring', async () => {
            await redis.set('mykey', 'Hello World');
            const substr = await redis.getrange('mykey', 0, 4);
            expect(substr).toBe('Hello');
        });
        test('setrange should modify part of string', async () => {
            await redis.set('mykey', 'Hello World');
            const length = await redis.setrange('mykey', 6, 'Redis');
            expect(length).toBe(11);
            expect(await redis.get('mykey')).toBe('Hello Redis');
        });
    });
    describe('Advanced SET operations', () => {
        test('setex should set key with expiration', async () => {
            await redis.setex('tempkey', 1, 'tempvalue');
            expect(await redis.get('tempkey')).toBe('tempvalue');
            await setup_1.testUtils.delay(1100);
            expect(await redis.get('tempkey')).toBeNull();
        });
        test('setnx should set only if key does not exist', async () => {
            const result1 = await redis.setnx('newkey', 'value1');
            expect(result1).toBe(1); // Success
            const result2 = await redis.setnx('newkey', 'value2');
            expect(result2).toBe(0); // Failed because key exists
            expect(await redis.get('newkey')).toBe('value1');
        });
        test('psetex should set key with millisecond expiration', async () => {
            await redis.psetex('tempkey', 500, 'tempvalue');
            expect(await redis.get('tempkey')).toBe('tempvalue');
            await setup_1.testUtils.delay(600);
            expect(await redis.get('tempkey')).toBeNull();
        });
    });
    describe('Error handling', () => {
        test('incr should throw error for non-numeric value', async () => {
            await redis.set('textkey', 'not_a_number');
            await expect(redis.incr('textkey')).rejects.toThrow();
        });
        test('incrby should throw error for non-numeric value', async () => {
            await redis.set('textkey', 'not_a_number');
            await expect(redis.incrby('textkey', 5)).rejects.toThrow();
        });
        test('operations should handle large values', async () => {
            const largeValue = 'x'.repeat(10000);
            await redis.set('largekey', largeValue);
            expect(await redis.get('largekey')).toBe(largeValue);
        });
    });
});
//# sourceMappingURL=string-commands.test.js.map