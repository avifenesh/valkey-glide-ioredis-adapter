/**
 * Hash Commands - Redis hash operations
 */

import { GlideClient } from '@valkey/valkey-glide';
import { RedisKey, RedisValue } from '../../types';
import { ParameterTranslator } from '../../utils/ParameterTranslator';

export class HashCommands {
  constructor(private getClient: () => Promise<GlideClient>) {}

  async hset(key: RedisKey, ...args: any[]): Promise<number> {
    const client = await this.getClient();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    
    // Parse field-value pairs
    const fieldValuePairs: Record<string, string> = {};
    if (args.length === 1 && typeof args[0] === 'object' && !Array.isArray(args[0])) {
      // Object format: hset(key, { field1: value1, field2: value2 })
      const obj = args[0];
      for (const [field, value] of Object.entries(obj)) {
        fieldValuePairs[field] = ParameterTranslator.normalizeValue(value as any);
      }
    } else {
      // Array format: hset(key, field1, value1, field2, value2, ...)
      for (let i = 0; i < args.length; i += 2) {
        const field = args[i].toString();
        const value = ParameterTranslator.normalizeValue(args[i + 1]);
        fieldValuePairs[field] = value;
      }
    }
    
    return await client.hset(normalizedKey, fieldValuePairs);
  }

  async hget(key: RedisKey, field: string): Promise<string | null> {
    const client = await this.getClient();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const result = await client.hget(normalizedKey, field);
    return ParameterTranslator.convertGlideString(result);
  }

  async hmset(key: RedisKey, ...args: any[]): Promise<string> {
    const client = await this.getClient();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    
    // Parse field-value pairs
    const fieldValuePairs: Record<string, string> = {};
    if (args.length === 1 && typeof args[0] === 'object' && !Array.isArray(args[0])) {
      // Object format
      const obj = args[0];
      for (const [field, value] of Object.entries(obj)) {
        fieldValuePairs[field] = ParameterTranslator.normalizeValue(value as any);
      }
    } else {
      // Array format
      for (let i = 0; i < args.length; i += 2) {
        const field = args[i].toString();
        const value = ParameterTranslator.normalizeValue(args[i + 1]);
        fieldValuePairs[field] = value;
      }
    }
    
    await client.hset(normalizedKey, fieldValuePairs);
    return 'OK';
  }

  async hmget(key: RedisKey, ...fieldsOrArray: any[]): Promise<(string | null)[]> {
    const client = await this.getClient();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const fields = Array.isArray(fieldsOrArray[0]) ? fieldsOrArray[0] : fieldsOrArray;
    const results = await client.hmget(normalizedKey, fields);
    return results.map(ParameterTranslator.convertGlideString);
  }

  async hgetall(key: RedisKey): Promise<Record<string, string>> {
    const client = await this.getClient();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const result = await client.hgetall(normalizedKey);
    
    const converted: Record<string, string> = {};
    for (const [field, value] of Object.entries(result)) {
      converted[field] = ParameterTranslator.convertGlideString(value) || '';
    }
    return converted;
  }

  async hdel(key: RedisKey, ...fields: string[]): Promise<number> {
    const client = await this.getClient();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    return await client.hdel(normalizedKey, fields);
  }

  async hexists(key: RedisKey, field: string): Promise<number> {
    const client = await this.getClient();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const result = await client.hexists(normalizedKey, field);
    return result ? 1 : 0;
  }

  async hkeys(key: RedisKey): Promise<string[]> {
    const client = await this.getClient();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const results = await client.hkeys(normalizedKey);
    return results.map(r => ParameterTranslator.convertGlideString(r) || '');
  }

  async hvals(key: RedisKey): Promise<string[]> {
    const client = await this.getClient();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const results = await client.hvals(normalizedKey);
    return results.map(r => ParameterTranslator.convertGlideString(r) || '');
  }

  async hlen(key: RedisKey): Promise<number> {
    const client = await this.getClient();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    return await client.hlen(normalizedKey);
  }

  async hincrby(key: RedisKey, field: string, increment: number): Promise<number> {
    const client = await this.getClient();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    return await client.hincrBy(normalizedKey, field, increment);
  }

  async hincrbyfloat(key: RedisKey, field: string, increment: number): Promise<number> {
    const client = await this.getClient();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const result = await client.hincrByFloat(normalizedKey, field, increment);
    return parseFloat(result.toString());
  }

  async hsetnx(key: RedisKey, field: string, value: RedisValue): Promise<number> {
    const client = await this.getClient();
    const normalizedKey = ParameterTranslator.normalizeKey(key);
    const normalizedValue = ParameterTranslator.normalizeValue(value);
    const result = await client.hsetnx(normalizedKey, field, normalizedValue);
    return result ? 1 : 0;
  }
}
