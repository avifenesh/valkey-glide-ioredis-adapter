"use strict";
/**
 * Basic smoke test for RedisAdapter
 */
Object.defineProperty(exports, "__esModule", { value: true });
const RedisAdapter_1 = require("../../src/adapters/RedisAdapter");
describe('RedisAdapter Basic Functionality', () => {
    test('should create adapter instance', () => {
        const adapter = new RedisAdapter_1.RedisAdapter();
        expect(adapter).toBeInstanceOf(RedisAdapter_1.RedisAdapter);
        expect(adapter.status).toBe('disconnected');
    });
    test('should create adapter with port and host', () => {
        const adapter = new RedisAdapter_1.RedisAdapter(6379, 'localhost');
        expect(adapter).toBeInstanceOf(RedisAdapter_1.RedisAdapter);
    });
    test('should create adapter with options object', () => {
        const adapter = new RedisAdapter_1.RedisAdapter({ port: 6379, host: 'localhost' });
        expect(adapter).toBeInstanceOf(RedisAdapter_1.RedisAdapter);
    });
    test('should parse redis URL', () => {
        const adapter = new RedisAdapter_1.RedisAdapter('redis://localhost:6379/0');
        expect(adapter).toBeInstanceOf(RedisAdapter_1.RedisAdapter);
    });
    test('should be an event emitter', () => {
        const adapter = new RedisAdapter_1.RedisAdapter();
        expect(typeof adapter.on).toBe('function');
        expect(typeof adapter.emit).toBe('function');
    });
});
//# sourceMappingURL=smoke.test.js.map