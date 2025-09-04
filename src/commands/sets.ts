import { RedisKey, RedisValue } from '../types';
import { ParameterTranslator } from '../utils/ParameterTranslator';
import { GlideClient, GlideClusterClient } from '@valkey/valkey-glide';

export class SetCommands {
  constructor(
    private glideClient: GlideClient | GlideClusterClient,
    private normalizeKeyFn: (key: RedisKey) => string
  ) {}

  async sadd(key: RedisKey, ...members: RedisValue[]): Promise<number> {
    const normalizedKey = this.normalizeKeyFn(key);
    const normalizedMembers = members.map(ParameterTranslator.normalizeValue);
    return await this.glideClient.sadd(normalizedKey, normalizedMembers);
  }

  async srem(key: RedisKey, ...members: RedisValue[]): Promise<number> {
    const normalizedKey = this.normalizeKeyFn(key);
    const normalizedMembers = members.map(ParameterTranslator.normalizeValue);
    return await this.glideClient.srem(normalizedKey, normalizedMembers);
  }

  async scard(key: RedisKey): Promise<number> {
    const normalizedKey = this.normalizeKeyFn(key);
    return await this.glideClient.scard(normalizedKey);
  }

  async sismember(key: RedisKey, member: RedisValue): Promise<number> {
    const normalizedKey = this.normalizeKeyFn(key);
    const normalizedMember = ParameterTranslator.normalizeValue(member);
    const result = await this.glideClient.sismember(
      normalizedKey,
      normalizedMember
    );
    return result ? 1 : 0;
  }

  async smismember(key: RedisKey, members: RedisValue[]): Promise<number[]> {
    const normalizedKey = this.normalizeKeyFn(key);
    const normalizedMembers = members.map(ParameterTranslator.normalizeValue);
    const result = await (this.glideClient as any).smismember(
      normalizedKey,
      normalizedMembers
    );
    return result.map((b: boolean) => (b ? 1 : 0));
  }

  async smembers(key: RedisKey): Promise<string[]> {
    const normalizedKey = this.normalizeKeyFn(key);
    const result = await this.glideClient.smembers(normalizedKey);
    // GLIDE returns Set<GlideString>, convert to string array for ioredis compatibility
    return Array.from(result).map(
      item => ParameterTranslator.convertGlideString(item) || ''
    );
  }

  async sinter(...keys: RedisKey[]): Promise<string[]> {
    const normalizedKeys = keys.map(this.normalizeKeyFn);
    const result = await this.glideClient.sinter(normalizedKeys);
    // GLIDE returns Set<GlideString>, convert to string array for ioredis compatibility
    return Array.from(result).map(
      item => ParameterTranslator.convertGlideString(item) || ''
    );
  }

  async sinterstore(
    destination: RedisKey,
    ...keys: RedisKey[]
  ): Promise<number> {
    const normalizedDestination = this.normalizeKeyFn(destination);
    const normalizedKeys = keys.map(this.normalizeKeyFn);
    return await this.glideClient.sinterstore(
      normalizedDestination,
      normalizedKeys
    );
  }

  async sdiff(...keys: RedisKey[]): Promise<string[]> {
    const normalizedKeys = keys.map(this.normalizeKeyFn);
    const result = await this.glideClient.sdiff(normalizedKeys);
    // GLIDE returns Set<GlideString>, convert to string array for ioredis compatibility
    return Array.from(result).map(
      item => ParameterTranslator.convertGlideString(item) || ''
    );
  }

  async sdiffstore(
    destination: RedisKey,
    ...keys: RedisKey[]
  ): Promise<number> {
    const normalizedDestination = this.normalizeKeyFn(destination);
    const normalizedKeys = keys.map(this.normalizeKeyFn);
    return await this.glideClient.sdiffstore(
      normalizedDestination,
      normalizedKeys
    );
  }

  async sunion(...keys: RedisKey[]): Promise<string[]> {
    const normalizedKeys = keys.map(this.normalizeKeyFn);
    const result = await this.glideClient.sunion(normalizedKeys);
    // GLIDE returns Set<GlideString>, convert to string array for ioredis compatibility
    return Array.from(result).map(
      item => ParameterTranslator.convertGlideString(item) || ''
    );
  }

  async sunionstore(
    destination: RedisKey,
    ...keys: RedisKey[]
  ): Promise<number> {
    const normalizedDestination = this.normalizeKeyFn(destination);
    const normalizedKeys = keys.map(this.normalizeKeyFn);
    return await this.glideClient.sunionstore(
      normalizedDestination,
      normalizedKeys
    );
  }

  async spop(key: RedisKey, count?: number): Promise<string | string[] | null> {
    const normalizedKey = this.normalizeKeyFn(key);

    if (count === undefined) {
      // Single member pop
      const result = await this.glideClient.spop(normalizedKey);
      return result
        ? ParameterTranslator.convertGlideString(result) || null
        : null;
    } else {
      // Multiple members pop
      const result = await this.glideClient.spopCount(normalizedKey, count);
      return Array.from(result).map(
        item => ParameterTranslator.convertGlideString(item) || ''
      );
    }
  }

  async srandmember(
    key: RedisKey,
    count?: number
  ): Promise<string | string[] | null> {
    const normalizedKey = this.normalizeKeyFn(key);

    if (count === undefined) {
      // Single member random
      const result = await this.glideClient.srandmember(normalizedKey);
      return result
        ? ParameterTranslator.convertGlideString(result) || null
        : null;
    } else {
      // Multiple members random
      const result = await this.glideClient.srandmemberCount(
        normalizedKey,
        count
      );
      return result.map(
        item => ParameterTranslator.convertGlideString(item) || ''
      );
    }
  }
}
