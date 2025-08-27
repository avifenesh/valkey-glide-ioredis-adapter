/**
 * List Commands - Redis list operations including blocking operations
 */

import { GlideClient } from '@valkey/valkey-glide';
import { RedisKey, RedisValue } from '../../types';
import { ParameterTranslator } from '../../utils/ParameterTranslator';

export class ListCommands {
  constructor(private getClient: () => Promise<GlideClient>) {}

  // Basic list operations
  async lpush(key: RedisKey, ...elements: RedisValue[]): Promise<number>;
  async lpush(key: RedisKey, elements: RedisValue[]): Promise<number>;
  async lpush(key: RedisKey, ...args: any[]): Promise<number> {
    const client = await this.getClient();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    
    // Handle both spread and array forms
    let values: RedisValue[];
    if (args.length === 1 && Array.isArray(args[0])) {
      values = args[0];
    } else {
      values = args;
    }
    
    const normalizedValues = values.map(ParameterTranslator.normalizeValue);
    return await client.lpush(normalizedKey, normalizedValues);
  }

  async rpush(key: RedisKey, ...elements: RedisValue[]): Promise<number>;
  async rpush(key: RedisKey, elements: RedisValue[]): Promise<number>;
  async rpush(key: RedisKey, ...args: any[]): Promise<number> {
    const client = await this.getClient();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    
    // Handle both spread and array forms
    let values: RedisValue[];
    if (args.length === 1 && Array.isArray(args[0])) {
      values = args[0];
    } else {
      values = args;
    }
    
    const normalizedValues = values.map(ParameterTranslator.normalizeValue);
    return await client.rpush(normalizedKey, normalizedValues);
  }

  async lpop(key: RedisKey, count?: number): Promise<string | string[] | null> {
    const client = await this.getClient();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    
    if (count !== undefined) {
      const results = await client.lpopCount(normalizedKey, count);
      return results ? results.map(r => ParameterTranslator.convertGlideString(r) || '') : null;
    } else {
      const result = await client.lpop(normalizedKey);
      return ParameterTranslator.convertGlideString(result);
    }
  }

  async rpop(key: RedisKey, count?: number): Promise<string | string[] | null> {
    const client = await this.getClient();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    
    if (count !== undefined) {
      const results = await client.rpopCount(normalizedKey, count);
      return results ? results.map(r => ParameterTranslator.convertGlideString(r) || '') : null;
    } else {
      const result = await client.rpop(normalizedKey);
      return ParameterTranslator.convertGlideString(result);
    }
  }

  async llen(key: RedisKey): Promise<number> {
    const client = await this.getClient();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    return await client.llen(normalizedKey);
  }

  async lrange(key: RedisKey, start: number, stop: number): Promise<string[]> {
    const client = await this.getClient();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const results = await client.lrange(normalizedKey, start, stop);
    return results.map(r => ParameterTranslator.convertGlideString(r) || '');
  }

  async ltrim(key: RedisKey, start: number, stop: number): Promise<string> {
    const client = await this.getClient();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    await client.ltrim(normalizedKey, start, stop);
    return 'OK';
  }

  async lindex(key: RedisKey, index: number): Promise<string | null> {
    const client = await this.getClient();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const result = await client.lindex(normalizedKey, index);
    return ParameterTranslator.convertGlideString(result);
  }

  async lset(key: RedisKey, index: number, value: RedisValue): Promise<string> {
    const client = await this.getClient();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const normalizedValue = ParameterTranslator.normalizeValue(value);
    await client.lset(normalizedKey, index, normalizedValue);
    return 'OK';
  }

  async lrem(key: RedisKey, count: number, value: RedisValue): Promise<number> {
    const client = await this.getClient();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const normalizedValue = ParameterTranslator.normalizeValue(value);
    return await client.lrem(normalizedKey, count, normalizedValue);
  }

  async linsert(key: RedisKey, direction: 'BEFORE' | 'AFTER', pivot: RedisValue, element: RedisValue): Promise<number> {
    const client = await this.getClient();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const normalizedPivot = ParameterTranslator.normalizeValue(pivot);
    const normalizedElement = ParameterTranslator.normalizeValue(element);
    const insertPosition = direction === 'BEFORE' ? 'before' : 'after';
    return await client.linsert(normalizedKey, insertPosition as any, normalizedPivot, normalizedElement);
  }

  async rpoplpush(source: RedisKey, destination: RedisKey): Promise<string | null> {
    const client = await this.getClient();
    const normalizedSource = ParameterTranslator.normalizeKey(source);
    const normalizedDest = ParameterTranslator.normalizeKey(destination);
    const result = await client.customCommand(['RPOPLPUSH', normalizedSource, normalizedDest]);
    return ParameterTranslator.convertGlideString(result);
  }

  // Blocking operations - critical for queue systems
  async blpop(...args: any[]): Promise<[string, string] | null> {
    const client = await this.getClient();
    
    let keys: RedisKey[];
    let timeout: number;
    
    // Handle both ioredis styles:
    // 1. blpop(timeout, ...keys) - original ioredis style
    // 2. blpop(...keys, timeout) - BullMQ style
    if (typeof args[args.length - 1] === 'number') {
      // BullMQ style: keys first, timeout last
      timeout = args[args.length - 1];
      keys = args.slice(0, -1);
    } else if (typeof args[0] === 'number') {
      // Original ioredis style: timeout first, keys after
      timeout = args[0];
      keys = args.slice(1);
    } else {
      throw new Error('Invalid blpop arguments: timeout must be provided');
    }
    
    const normalizedKeys = keys.map(ParameterTranslator.normalizeKey);
    
    const result = await client.blpop(normalizedKeys, timeout);
    
    if (Array.isArray(result) && result.length === 2) {
      return [
        ParameterTranslator.convertGlideString(result[0]) || '',
        ParameterTranslator.convertGlideString(result[1]) || ''
      ];
    }
    
    return null;
  }

  async brpop(...args: any[]): Promise<[string, string] | null> {
    const client = await this.getClient();
    
    let keys: RedisKey[];
    let timeout: number;
    
    // Handle both ioredis styles:
    // 1. brpop(timeout, ...keys) - original ioredis style
    // 2. brpop(...keys, timeout) - BullMQ style
    if (typeof args[args.length - 1] === 'number') {
      // BullMQ style: keys first, timeout last
      timeout = args[args.length - 1];
      keys = args.slice(0, -1);
    } else if (typeof args[0] === 'number') {
      // Original ioredis style: timeout first, keys after
      timeout = args[0];
      keys = args.slice(1);
    } else {
      throw new Error('Invalid brpop arguments: timeout must be provided');
    }
    
    const normalizedKeys = keys.map(ParameterTranslator.normalizeKey);
    
    const result = await client.brpop(normalizedKeys, timeout);
    
    if (Array.isArray(result) && result.length === 2) {
      return [
        ParameterTranslator.convertGlideString(result[0]) || '',
        ParameterTranslator.convertGlideString(result[1]) || ''
      ];
    }
    
    return null;
  }

  async brpoplpush(source: RedisKey, destination: RedisKey, timeout: number): Promise<string | null> {
    const client = await this.getClient();
    const normalizedSource = ParameterTranslator.normalizeKey(source);
    const normalizedDestination = ParameterTranslator.normalizeKey(destination);
    
    // BRPOPLPUSH is not available in GLIDE, must use customCommand
    const result = await client.customCommand(['BRPOPLPUSH', normalizedSource, normalizedDestination, timeout.toString()]);
    return ParameterTranslator.convertGlideString(result);
  }
}
