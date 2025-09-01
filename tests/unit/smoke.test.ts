/**
 * Basic smoke test for Redis
 */

import { Redis } from "../../src";

describe('Redis Basic Functionality', () => {
  test('should create adapter instance', () => {
    const adapter = new Redis();
    expect(adapter).toBeInstanceOf(Redis);
    expect(adapter.status).toBe('disconnected');
  });

  test('should create adapter with port and host', () => {
    const adapter = new Redis(6379, 'localhost');
    expect(adapter).toBeInstanceOf(Redis);
  });

  test('should create adapter with options object', () => {
    const adapter = new Redis({ port: 6379, host: 'localhost' });
    expect(adapter).toBeInstanceOf(Redis);
  });

  test('should parse redis URL', () => {
    const adapter = new Redis('redis://localhost:6379/0');
    expect(adapter).toBeInstanceOf(Redis);
  });

  test('should be an event emitter', () => {
    const adapter = new Redis();
    expect(typeof adapter.on).toBe('function');
    expect(typeof adapter.emit).toBe('function');
  });
});