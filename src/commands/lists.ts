import { RedisKey, RedisValue } from '../types';
import { ParameterTranslator } from '../utils/ParameterTranslator';
import { GlideClient, GlideClusterClient } from '@valkey/valkey-glide';

export class ListCommands {
  constructor(
    private glideClient: GlideClient | GlideClusterClient,
    private normalizeKeyFn: (key: RedisKey) => string
  ) {}

  async lpush(key: RedisKey, ...elements: RedisValue[]): Promise<number>;
  async lpush(key: RedisKey, elements: RedisValue[]): Promise<number>;
  async lpush(key: RedisKey, ...args: any[]): Promise<number> {
    const normalizedKey = this.normalizeKeyFn(key);

    // Handle both spread and array forms
    let values: RedisValue[];
    if (args.length === 1 && Array.isArray(args[0])) {
      values = args[0];
    } else {
      values = args;
    }

    const normalizedValues = values.map(ParameterTranslator.normalizeValue);
    return await this.glideClient.lpush(normalizedKey, normalizedValues);
  }

  async rpush(key: RedisKey, ...elements: RedisValue[]): Promise<number>;
  async rpush(key: RedisKey, elements: RedisValue[]): Promise<number>;
  async rpush(key: RedisKey, ...args: any[]): Promise<number> {
    const normalizedKey = this.normalizeKeyFn(key);

    // Handle both spread and array forms
    let values: RedisValue[];
    if (args.length === 1 && Array.isArray(args[0])) {
      values = args[0];
    } else {
      values = args;
    }

    const normalizedValues = values.map(ParameterTranslator.normalizeValue);
    return await this.glideClient.rpush(normalizedKey, normalizedValues);
  }

  async lpop(key: RedisKey, count?: number): Promise<string | string[] | null> {
    const normalizedKey = this.normalizeKeyFn(key);

    if (count !== undefined) {
      const results = await this.glideClient.lpopCount(normalizedKey, count);
      return results
        ? results.map(r => ParameterTranslator.convertGlideString(r) || '')
        : null;
    } else {
      const result = await this.glideClient.lpop(normalizedKey);
      return ParameterTranslator.convertGlideString(result);
    }
  }

  async rpop(key: RedisKey, count?: number): Promise<string | string[] | null> {
    const normalizedKey = this.normalizeKeyFn(key);

    if (count !== undefined) {
      const results = await this.glideClient.rpopCount(normalizedKey, count);
      return results
        ? results.map(r => ParameterTranslator.convertGlideString(r) || '')
        : null;
    } else {
      const result = await this.glideClient.rpop(normalizedKey);
      return ParameterTranslator.convertGlideString(result);
    }
  }

  async llen(key: RedisKey): Promise<number> {
    const normalizedKey = this.normalizeKeyFn(key);
    return await this.glideClient.llen(normalizedKey);
  }

  async lrange(key: RedisKey, start: number, stop: number): Promise<string[]> {
    const normalizedKey = this.normalizeKeyFn(key);
    const results = await this.glideClient.lrange(normalizedKey, start, stop);
    return results.map(r => ParameterTranslator.convertGlideString(r) || '');
  }

  async ltrim(key: RedisKey, start: number, stop: number): Promise<string> {
    const normalizedKey = this.normalizeKeyFn(key);
    await this.glideClient.ltrim(normalizedKey, start, stop);
    return 'OK';
  }

  async lindex(key: RedisKey, index: number): Promise<string | null> {
    const normalizedKey = this.normalizeKeyFn(key);
    const result = await this.glideClient.lindex(normalizedKey, index);
    return ParameterTranslator.convertGlideString(result);
  }

  async lset(key: RedisKey, index: number, value: RedisValue): Promise<string> {
    const normalizedKey = this.normalizeKeyFn(key);
    const normalizedValue = ParameterTranslator.normalizeValue(value);
    await this.glideClient.lset(normalizedKey, index, normalizedValue);
    return 'OK';
  }

  async lrem(key: RedisKey, count: number, value: RedisValue): Promise<number> {
    const normalizedKey = this.normalizeKeyFn(key);
    const normalizedValue = ParameterTranslator.normalizeValue(value);
    return await this.glideClient.lrem(normalizedKey, count, normalizedValue);
  }

  async linsert(
    key: RedisKey,
    direction: 'BEFORE' | 'AFTER',
    pivot: RedisValue,
    element: RedisValue
  ): Promise<number> {
    const normalizedKey = this.normalizeKeyFn(key);
    const normalizedPivot = ParameterTranslator.normalizeValue(pivot);
    const normalizedElement = ParameterTranslator.normalizeValue(element);
    const insertPosition = direction === 'BEFORE' ? 'before' : 'after';
    return await this.glideClient.linsert(
      normalizedKey,
      insertPosition as any,
      normalizedPivot,
      normalizedElement
    );
  }

  async rpoplpush(
    source: RedisKey,
    destination: RedisKey
  ): Promise<string | null> {
    const normalizedSource = this.normalizeKeyFn(source);
    const normalizedDest = this.normalizeKeyFn(destination);
    const result = await this.glideClient.customCommand([
      'RPOPLPUSH',
      normalizedSource,
      normalizedDest,
    ]);
    return ParameterTranslator.convertGlideString(result);
  }

  async lpos(
    key: RedisKey,
    element: RedisValue,
    rank?: number,
    count?: number,
    maxlen?: number
  ): Promise<number | number[] | null> {
    const normalizedKey = this.normalizeKeyFn(key);
    const normalizedElement = ParameterTranslator.normalizeValue(element);
    
    const args: any[] = [normalizedKey, normalizedElement];
    if (rank !== undefined) args.push('RANK', rank);
    if (count !== undefined) args.push('COUNT', count);
    if (maxlen !== undefined) args.push('MAXLEN', maxlen);
    
    const result = await this.glideClient.customCommand(['LPOS', ...args]);
    return result as number | number[] | null;
  }

  async lmove(
    source: RedisKey,
    destination: RedisKey,
    from: 'LEFT' | 'RIGHT',
    to: 'LEFT' | 'RIGHT'
  ): Promise<string | null> {
    const normalizedSource = this.normalizeKeyFn(source);
    const normalizedDest = this.normalizeKeyFn(destination);
    const result = await this.glideClient.customCommand([
      'LMOVE',
      normalizedSource,
      normalizedDest,
      from,
      to,
    ]);
    return ParameterTranslator.convertGlideString(result);
  }

  async blmove(
    source: RedisKey,
    destination: RedisKey,
    from: 'LEFT' | 'RIGHT',
    to: 'LEFT' | 'RIGHT',
    timeout: number
  ): Promise<string | null> {
    const normalizedSource = this.normalizeKeyFn(source);
    const normalizedDest = this.normalizeKeyFn(destination);
    const result = await this.glideClient.customCommand([
      'BLMOVE',
      normalizedSource,
      normalizedDest,
      from,
      to,
      String(timeout),
    ]);
    return ParameterTranslator.convertGlideString(result);
  }

  async lpushx(
    key: RedisKey,
    ...elements: RedisValue[]
  ): Promise<number> {
    const normalizedKey = this.normalizeKeyFn(key);
    const normalizedValues = elements.map(ParameterTranslator.normalizeValue);
    // Use customCommand for compatibility
    const result = await (this.glideClient as any).customCommand([
      'LPUSHX',
      normalizedKey,
      ...normalizedValues,
    ]);
    return Number(result) || 0;
  }

  async rpushx(
    key: RedisKey,
    ...elements: RedisValue[]
  ): Promise<number> {
    const normalizedKey = this.normalizeKeyFn(key);
    const normalizedValues = elements.map(ParameterTranslator.normalizeValue);
    const result = await (this.glideClient as any).customCommand([
      'RPUSHX',
      normalizedKey,
      ...normalizedValues,
    ]);
    return Number(result) || 0;
  }
}
