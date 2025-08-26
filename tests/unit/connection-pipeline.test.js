"use strict";
/**
 * Connection and Pipeline Behavioral Tests
 * These tests are adapted from ioredis patterns to ensure compatibility
 */
Object.defineProperty(exports, "__esModule", { value: true });
const RedisAdapter_1 = require("../../src/adapters/RedisAdapter");
const setup_1 = require("../setup");
describe('Connection Management (ioredis compatibility)', () => {
    let redis;
    beforeAll(async () => {
        // Check if test servers are available
        const serversAvailable = await setup_1.testUtils.checkTestServers();
        if (!serversAvailable) {
            console.warn('⚠️  Test servers not available. Please run: ./scripts/start-test-servers.sh');
            console.warn('   Skipping connection tests...');
        }
    });
    afterEach(async () => {
        if (redis) {
            await redis.disconnect();
        }
    });
    describe('Client creation patterns', () => {
        test('should create client with default options', async () => {
            const serversAvailable = await setup_1.testUtils.checkTestServers();
            if (!serversAvailable) {
                pending('Test servers not available');
                return;
            }
            const config = await setup_1.testUtils.getStandaloneConfig();
            redis = new RedisAdapter_1.RedisAdapter(config);
            await redis.connect();
            // Basic connectivity test
            const result = await redis.ping();
            expect(result).toBe('PONG');
        });
        test('should create client with port and host', async () => {
            const serversAvailable = await setup_1.testUtils.checkTestServers();
            if (!serversAvailable) {
                pending('Test servers not available');
                return;
            }
            const config = await setup_1.testUtils.getStandaloneConfig();
            redis = new RedisAdapter_1.RedisAdapter(config.port, config.host);
            await redis.connect();
            const result = await redis.ping();
            expect(result).toBe('PONG');
        });
        test('should create client with options object', async () => {
            const serversAvailable = await setup_1.testUtils.checkTestServers();
            if (!serversAvailable) {
                pending('Test servers not available');
                return;
            }
            const config = await setup_1.testUtils.getStandaloneConfig();
            redis = new RedisAdapter_1.RedisAdapter({
                port: config.port,
                host: config.host,
                retryDelayOnFailover: 100,
                maxRetriesPerRequest: 3,
            });
            await redis.connect();
            const result = await redis.ping();
            expect(result).toBe('PONG');
        });
        test('should create client with redis:// URL', async () => {
            const serversAvailable = await setup_1.testUtils.checkTestServers();
            if (!serversAvailable) {
                pending('Test servers not available');
                return;
            }
            const config = await setup_1.testUtils.getStandaloneConfig();
            redis = new RedisAdapter_1.RedisAdapter(`redis://${config.host}:${config.port}/0`);
            await redis.connect();
            const result = await redis.ping();
            expect(result).toBe('PONG');
        });
        test('should handle database selection', async () => {
            const serversAvailable = await setup_1.testUtils.checkTestServers();
            if (!serversAvailable) {
                pending('Test servers not available');
                return;
            }
            const config = await setup_1.testUtils.getStandaloneConfig();
            redis = new RedisAdapter_1.RedisAdapter({ port: config.port, host: config.host, db: 1 });
            await redis.connect();
            // Test that we're using the correct database
            await redis.set('dbtest', 'value');
            expect(await redis.get('dbtest')).toBe('value');
        });
    });
    describe('Connection lifecycle', () => {
        test('should emit ready event when connected', async () => {
            const serversAvailable = await setup_1.testUtils.checkTestServers();
            if (!serversAvailable) {
                pending('Test servers not available');
                return;
            }
            const config = await setup_1.testUtils.getStandaloneConfig();
            redis = new RedisAdapter_1.RedisAdapter(config);
            const readyPromise = new Promise(resolve => {
                redis.on('ready', resolve);
            });
            await redis.connect();
            await readyPromise;
            expect(redis.status).toBe('ready');
        });
        test('should emit connect event', async () => {
            const serversAvailable = await setup_1.testUtils.checkTestServers();
            if (!serversAvailable) {
                pending('Test servers not available');
                return;
            }
            const config = await setup_1.testUtils.getStandaloneConfig();
            redis = new RedisAdapter_1.RedisAdapter(config);
            const connectPromise = new Promise(resolve => {
                redis.on('connect', resolve);
            });
            await redis.connect();
            await connectPromise;
        });
        test('should emit end event when disconnected', async () => {
            const serversAvailable = await setup_1.testUtils.checkTestServers();
            if (!serversAvailable) {
                pending('Test servers not available');
                return;
            }
            const config = await setup_1.testUtils.getStandaloneConfig();
            redis = new RedisAdapter_1.RedisAdapter(config);
            await redis.connect();
            const endPromise = new Promise(resolve => {
                redis.on('end', resolve);
            });
            await redis.disconnect();
            await endPromise;
            expect(redis.status).toBe('end');
        });
        test('should handle reconnection', async () => {
            const serversAvailable = await setup_1.testUtils.checkTestServers();
            if (!serversAvailable) {
                pending('Test servers not available');
                return;
            }
            const config = await setup_1.testUtils.getStandaloneConfig();
            redis = new RedisAdapter_1.RedisAdapter({ ...config, retryDelayOnFailover: 10 });
            await redis.connect();
            // Simulate connection loss and recovery
            const reconnectPromise = new Promise(resolve => {
                redis.on('ready', resolve);
            });
            // Force reconnection simulation
            redis.disconnect();
            await redis.connect();
            await reconnectPromise;
        });
    });
    describe('Error handling', () => {
        test('should emit error events', async () => {
            redis = new RedisAdapter_1.RedisAdapter({ port: 9999 }); // Non-existent port
            const errorPromise = new Promise(resolve => {
                redis.on('error', resolve);
            });
            try {
                await redis.connect();
            }
            catch (error) {
                // Expected to fail
            }
            const error = await errorPromise;
            expect(error).toBeInstanceOf(Error);
        });
        test('should handle command errors gracefully', async () => {
            const serversAvailable = await setup_1.testUtils.checkTestServers();
            if (!serversAvailable) {
                pending('Test servers not available');
                return;
            }
            const config = await setup_1.testUtils.getStandaloneConfig();
            redis = new RedisAdapter_1.RedisAdapter(config);
            await redis.connect();
            // Try to increment a non-numeric value
            await redis.set('text', 'not_a_number');
            await expect(redis.incr('text')).rejects.toThrow();
            // Connection should still be usable
            expect(await redis.ping()).toBe('PONG');
        });
    });
});
describe('Pipeline Operations (ioredis compatibility)', () => {
    let redis;
    beforeAll(async () => {
        // Check if test servers are available
        const serversAvailable = await setup_1.testUtils.checkTestServers();
        if (!serversAvailable) {
            console.warn('⚠️  Test servers not available. Please run: ./scripts/start-test-servers.sh');
            console.warn('   Skipping pipeline tests...');
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
            await redis.del('key1', 'key2', 'key3', 'string_key', 'hash_key', 'list_key', 'number', 'text', 'watched_key', 'non_numeric_key', 'good1', 'good2');
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
    describe('Basic pipeline operations', () => {
        test('should execute multiple commands in pipeline', async () => {
            const pipeline = redis.pipeline();
            pipeline.set('key1', 'value1');
            pipeline.set('key2', 'value2');
            pipeline.get('key1');
            pipeline.get('key2');
            const results = await pipeline.exec();
            // ioredis returns [[error, result], [error, result], ...]
            expect(results).toEqual([
                [null, 'OK'],
                [null, 'OK'],
                [null, 'value1'],
                [null, 'value2'],
            ]);
        });
        test('should handle mixed command types in pipeline', async () => {
            const pipeline = redis.pipeline();
            pipeline.set('string_key', 'string_value');
            pipeline.hset('hash_key', 'field', 'hash_value');
            pipeline.lpush('list_key', 'list_value');
            pipeline.get('string_key');
            pipeline.hget('hash_key', 'field');
            pipeline.lpop('list_key');
            const results = await pipeline.exec();
            expect(results).toEqual([
                [null, 'OK'], // set
                [null, 1], // hset
                [null, 1], // lpush
                [null, 'string_value'], // get
                [null, 'hash_value'], // hget
                [null, 'list_value'], // lpop
            ]);
        });
        test('should handle errors in pipeline', async () => {
            const pipeline = redis.pipeline();
            pipeline.set('number', '10');
            pipeline.incr('number'); // Should succeed
            pipeline.set('text', 'abc');
            pipeline.incr('text'); // Should fail
            pipeline.get('number'); // Should succeed
            const results = await pipeline.exec();
            expect(results[0]).toEqual([null, 'OK']);
            expect(results[1]).toEqual([null, 11]);
            expect(results[2]).toEqual([null, 'OK']);
            expect(results[3]).toBeDefined();
            if (results[3])
                expect(results[3][0]).toBeInstanceOf(Error); // Error for incr on text
            expect(results[4]).toEqual([null, '11']);
        });
        test('pipeline should be chainable', async () => {
            const results = await redis
                .pipeline()
                .set('key1', 'value1')
                .set('key2', 'value2')
                .mget('key1', 'key2')
                .exec();
            expect(results).toEqual([
                [null, 'OK'],
                [null, 'OK'],
                [null, ['value1', 'value2']],
            ]);
        });
    });
    describe('Pipeline performance characteristics', () => {
        test('should batch commands efficiently', async () => {
            const pipeline = redis.pipeline();
            // Add many commands
            for (let i = 0; i < 100; i++) {
                pipeline.set(`key${i}`, `value${i}`);
            }
            const startTime = Date.now();
            const results = await pipeline.exec();
            const endTime = Date.now();
            expect(results).toHaveLength(100);
            expect(results.every(([error, result]) => error === null && result === 'OK')).toBe(true);
            // Pipeline should be faster than individual commands
            // This is a rough performance check
            expect(endTime - startTime).toBeLessThan(1000);
        });
        test('should handle empty pipeline', async () => {
            const pipeline = redis.pipeline();
            const results = await pipeline.exec();
            expect(results).toEqual([]);
        });
    });
    describe('Pipeline with transactions', () => {
        test('should support atomic transactions', async () => {
            const multi = redis.multi();
            multi.set('counter', '0');
            multi.incr('counter');
            multi.incr('counter');
            multi.get('counter');
            const results = await multi.exec();
            expect(results).toEqual([
                [null, 'OK'],
                [null, 1],
                [null, 2],
                [null, '2'],
            ]);
        });
        test('should handle transaction rollback on error', async () => {
            await redis.set('existing_string', 'text_value');
            const multi = redis.multi();
            multi.incr('existing_string'); // This will cause transaction to fail
            multi.set('should_not_be_set', 'value');
            const results = await multi.exec();
            // Transaction should be aborted, results should indicate failure
            expect(results).toBeNull(); // Or handle according to ioredis behavior
            // Verify no changes were made
            expect(await redis.exists('should_not_be_set')).toBe(0);
        });
        test('should support WATCH for optimistic locking', async () => {
            await redis.set('watched_key', '10');
            // Start watching
            await redis.watch('watched_key');
            // Simulate concurrent modification
            const config = await setup_1.testUtils.getStandaloneConfig();
            const otherClient = new RedisAdapter_1.RedisAdapter(config);
            await otherClient.connect();
            await otherClient.set('watched_key', '20');
            await otherClient.disconnect();
            // Transaction should fail due to watched key modification
            const multi = redis.multi();
            multi.incr('watched_key');
            const results = await multi.exec();
            expect(results).toBeNull(); // Transaction aborted
            // Verify original value from other client
            expect(await redis.get('watched_key')).toBe('20');
        });
    });
    describe('Pipeline error recovery', () => {
        test('should continue processing after command error', async () => {
            // Setup: Create a key with string value that can't be incremented
            await redis.set('non_numeric_key', 'not_a_number');
            const pipeline = redis.pipeline();
            pipeline.set('good1', 'value1');
            pipeline.incr('non_numeric_key'); // Will error
            pipeline.set('good2', 'value2');
            pipeline.get('good1');
            pipeline.get('good2');
            const results = await pipeline.exec();
            expect(results[0]).toEqual([null, 'OK']);
            expect(results[1]).toBeDefined();
            if (results[1])
                expect(results[1][0]).toBeInstanceOf(Error);
            expect(results[2]).toEqual([null, 'OK']);
            expect(results[3]).toEqual([null, 'value1']);
            expect(results[4]).toEqual([null, 'value2']);
        });
        test('should handle pipeline abort', async () => {
            const pipeline = redis.pipeline();
            pipeline.set('key1', 'value1');
            pipeline.set('key2', 'value2');
            // Abort before execution
            pipeline.discard();
            const results = await pipeline.exec();
            expect(results).toEqual([]); // No commands executed
            // Verify no keys were set
            expect(await redis.exists('key1')).toBe(0);
            expect(await redis.exists('key2')).toBe(0);
        });
    });
    describe('Edge cases', () => {
        test('should handle very large pipelines', async () => {
            const pipeline = redis.pipeline();
            const commandCount = 1000;
            for (let i = 0; i < commandCount; i++) {
                pipeline.set(`large_key_${i}`, `large_value_${i}`);
            }
            const results = await pipeline.exec();
            expect(results).toHaveLength(commandCount);
            expect(results.every(([error, result]) => error === null && result === 'OK')).toBe(true);
        });
        test('should handle commands with large payloads', async () => {
            const largeValue = 'x'.repeat(100000); // 100KB value
            const pipeline = redis.pipeline();
            pipeline.set('large_key', largeValue);
            pipeline.get('large_key');
            const results = await pipeline.exec();
            expect(results[0]).toEqual([null, 'OK']);
            expect(results[1]).toEqual([null, largeValue]);
        });
    });
});
//# sourceMappingURL=connection-pipeline.test.js.map