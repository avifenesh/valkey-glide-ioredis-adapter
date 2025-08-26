"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const RedisAdapter_1 = require("../../src/adapters/RedisAdapter");
const setup_1 = require("../../tests/setup");
describe('Script Commands', () => {
    let redis;
    beforeAll(async () => {
        // Check if test servers are available
        const serversAvailable = await setup_1.testUtils.checkTestServers();
        if (!serversAvailable) {
            console.warn('⚠️  Test servers not available. Please run: ./scripts/start-test-servers.sh');
            return;
        }
        const config = await setup_1.testUtils.getStandaloneConfig();
        redis = new RedisAdapter_1.RedisAdapter(config);
        await redis.connect();
    });
    afterAll(async () => {
        if (redis) {
            await redis.disconnect();
        }
    });
    it('should load and execute a simple script', async () => {
        // Skip test if servers are not available
        if (!await setup_1.testUtils.checkTestServers()) {
            return;
        }
        const script = 'return "Hello, World!"';
        const hash = await redis.scriptLoad(script);
        expect(typeof hash).toBe('string');
        expect(hash.length).toBeGreaterThan(0);
        const result = await redis.eval(script, 0);
        expect(result).toBe('Hello, World!');
    });
    it('should check if script exists', async () => {
        // Skip test if servers are not available
        if (!await setup_1.testUtils.checkTestServers()) {
            return;
        }
        const script = 'return 1';
        const hash = await redis.scriptLoad(script);
        const exists = await redis.scriptExists(hash);
        expect(exists).toEqual([true]);
        // Check a non-existent script
        const fakeHash = 'fakehash123';
        const notExists = await redis.scriptExists(fakeHash);
        expect(notExists).toEqual([false]);
    });
    it('should execute script by SHA', async () => {
        // Skip test if servers are not available
        if (!await setup_1.testUtils.checkTestServers()) {
            return;
        }
        const script = 'return "Executed by SHA"';
        const hash = await redis.scriptLoad(script);
        const result = await redis.evalsha(hash, 0);
        expect(result).toBe('Executed by SHA');
    });
    it('should flush scripts', async () => {
        // Skip test if servers are not available
        if (!await setup_1.testUtils.checkTestServers()) {
            return;
        }
        const script = 'return "Flush test"';
        const hash = await redis.scriptLoad(script);
        // Verify script exists
        const existsBefore = await redis.scriptExists(hash);
        expect(existsBefore).toEqual([true]);
        // Flush scripts
        await redis.scriptFlush();
        // Verify script no longer exists
        const existsAfter = await redis.scriptExists(hash);
        expect(existsAfter).toEqual([false]);
    });
    it('should handle script with keys and arguments', async () => {
        // Skip test if servers are not available
        if (!await setup_1.testUtils.checkTestServers()) {
            return;
        }
        const script = 'return {KEYS[1], ARGV[1]}';
        await redis.set('testkey', 'testvalue');
        const result = await redis.eval(script, 1, 'testkey', 'testarg');
        expect(result).toEqual(['testkey', 'testarg']);
    });
});
//# sourceMappingURL=script-commands.test.js.map