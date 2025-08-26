/**
 * Basic smoke test for RedisAdapter
 */

import { RedisAdapter } from '../../src/adapters/RedisAdapter';

describe('RedisAdapter Basic Functionality', () => {
  test('should create adapter instance', () => {
    const adapter = new RedisAdapter();
    expect(adapter).toBeInstanceOf(RedisAdapter);
    expect(adapter.status).toBe('disconnected');
  });

  test('should create adapter with port and host', () => {
    const adapter = new RedisAdapter(6379, 'localhost');
    expect(adapter).toBeInstanceOf(RedisAdapter);
  });

  test('should create adapter with options object', () => {
    const adapter = new RedisAdapter({ port: 6379, host: 'localhost' });
    expect(adapter).toBeInstanceOf(RedisAdapter);
  });

  test('should parse redis URL', () => {
    const adapter = new RedisAdapter('redis://localhost:6379/0');
    expect(adapter).toBeInstanceOf(RedisAdapter);
  });

  test('should be an event emitter', () => {
    const adapter = new RedisAdapter();
    expect(typeof adapter.on).toBe('function');
    expect(typeof adapter.emit).toBe('function');
  });
});