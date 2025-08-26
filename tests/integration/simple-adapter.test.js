"use strict";
/**
 * Simple Integration Test - Basic Adapter Functionality
 * Tests that our ioredis adapter can connect and perform basic operations
 */
Object.defineProperty(exports, "__esModule", { value: true });
const RedisAdapter_1 = require("../../src/adapters/RedisAdapter");
const setup_1 = require("../setup");
describe('Simple Adapter Integration Test', () => {
    let adapter;
    beforeAll(async () => {
        // Check if test servers are available
        const serversAvailable = await setup_1.testUtils.checkTestServers();
        if (!serversAvailable) {
            console.warn('⚠️  Test servers not available. Skipping integration tests...');
            return;
        }
    });
    beforeEach(async () => {
        // Skip tests if servers are not available
        const serversAvailable = await setup_1.testUtils.checkTestServers();
        if (!serversAvailable) {
            console.warn('⚠️  Test servers not available. Skipping test...');
            return;
        }
        const config = await setup_1.testUtils.getStandaloneConfig();
        adapter = new RedisAdapter_1.RedisAdapter(config);
        await adapter.connect();
    });
    afterEach(async () => {
        if (adapter) {
            try {
                // Clean up test data - find all test keys first, then delete them
                const testKeys = await adapter.keys('test:*');
                if (testKeys.length > 0) {
                    await adapter.del(...testKeys);
                }
            }
            catch {
                // Ignore cleanup errors
            }
            await adapter.disconnect();
        }
    });
    test('should connect and ping successfully', async () => {
        const serversAvailable = await setup_1.testUtils.checkTestServers();
        if (!serversAvailable) {
            console.warn('⚠️  Skipping test - servers not available');
            return;
        }
        const result = await adapter.ping();
        expect(result).toBe('PONG');
    });
    test('should perform basic string operations', async () => {
        const serversAvailable = await setup_1.testUtils.checkTestServers();
        if (!serversAvailable) {
            console.warn('⚠️  Skipping test - servers not available');
            return;
        }
        // Set a value
        await adapter.set('test:key1', 'Hello World');
        // Get the value
        const value = await adapter.get('test:key1');
        expect(value).toBe('Hello World');
        // Check existence
        const exists = await adapter.exists('test:key1');
        expect(exists).toBe(1);
    });
    test('should handle multiple operations', async () => {
        const serversAvailable = await setup_1.testUtils.checkTestServers();
        if (!serversAvailable) {
            console.warn('⚠️  Skipping test - servers not available');
            return;
        }
        // Set multiple values
        await adapter.mset({
            'test:key1': 'value1',
            'test:key2': 'value2',
            'test:key3': 'value3'
        });
        // Get multiple values
        const values = await adapter.mget(['test:key1', 'test:key2', 'test:key3']);
        expect(values).toEqual(['value1', 'value2', 'value3']);
    });
    test('should work with hash operations', async () => {
        const serversAvailable = await setup_1.testUtils.checkTestServers();
        if (!serversAvailable) {
            console.warn('⚠️  Skipping test - servers not available');
            return;
        }
        // Set hash values
        await adapter.hset('test:hash', {
            field1: 'value1',
            field2: 'value2'
        });
        // Get hash value
        const value = await adapter.hget('test:hash', 'field1');
        expect(value).toBe('value1');
        // Get all hash values
        const allValues = await adapter.hgetall('test:hash');
        expect(allValues).toEqual({
            field1: 'value1',
            field2: 'value2'
        });
    });
    test('should work with list operations', async () => {
        const serversAvailable = await setup_1.testUtils.checkTestServers();
        if (!serversAvailable) {
            console.warn('⚠️  Skipping test - servers not available');
            return;
        }
        // Push values to list
        await adapter.lpush('test:list', ['item1', 'item2', 'item3']);
        // Get list length
        const length = await adapter.llen('test:list');
        expect(length).toBe(3);
        // Get list range
        const items = await adapter.lrange('test:list', 0, -1);
        expect(items).toEqual(['item3', 'item2', 'item1']); // Note: LPUSH reverses order
    });
    test('should work with keys pattern matching', async () => {
        const serversAvailable = await setup_1.testUtils.checkTestServers();
        if (!serversAvailable) {
            console.warn('⚠️  Skipping test - servers not available');
            return;
        }
        // Set some test keys
        await adapter.set('test:user:1', 'user1');
        await adapter.set('test:user:2', 'user2');
        await adapter.set('test:other:1', 'other1');
        // Find keys with pattern
        const userKeys = await adapter.keys('test:user:*');
        expect(userKeys.sort()).toEqual(['test:user:1', 'test:user:2']);
    });
});
//# sourceMappingURL=simple-adapter.test.js.map