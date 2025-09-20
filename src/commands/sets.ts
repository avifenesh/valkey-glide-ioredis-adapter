import { RedisKey, RedisValue } from '../types';
import { ParameterTranslator } from '../utils/ParameterTranslator';
import { BaseClient } from '../BaseClient';

export async function sadd(
  client: BaseClient,
  key: RedisKey,
  ...members: RedisValue[]
): Promise<number> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const normalizedMembers = members.map(ParameterTranslator.normalizeValue);
  return await (client as any).glideClient.sadd(
    normalizedKey,
    normalizedMembers
  );
}

export async function srem(
  client: BaseClient,
  key: RedisKey,
  ...members: RedisValue[]
): Promise<number> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const normalizedMembers = members.map(ParameterTranslator.normalizeValue);
  return await (client as any).glideClient.srem(
    normalizedKey,
    normalizedMembers
  );
}

export async function scard(
  client: BaseClient,
  key: RedisKey
): Promise<number> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  return await (client as any).glideClient.scard(normalizedKey);
}

export async function sismember(
  client: BaseClient,
  key: RedisKey,
  member: RedisValue
): Promise<number> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const normalizedMember = ParameterTranslator.normalizeValue(member);
  const result = await (client as any).glideClient.sismember(
    normalizedKey,
    normalizedMember
  );
  return result ? 1 : 0;
}

export async function smismember(
  client: BaseClient,
  key: RedisKey,
  members: RedisValue[]
): Promise<number[]> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const normalizedMembers = members.map(ParameterTranslator.normalizeValue);
  const result = await ((client as any).glideClient as any).smismember(
    normalizedKey,
    normalizedMembers
  );
  return result.map((b: boolean) => (b ? 1 : 0));
}

export async function smembers(
  client: BaseClient,
  key: RedisKey
): Promise<string[]> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const result = await (client as any).glideClient.smembers(normalizedKey);
  // GLIDE returns Set<GlideString>, convert to string array for ioredis compatibility
  return Array.from(result).map(
    (item: any) => ParameterTranslator.convertGlideString(item) || ''
  );
}

export async function sinter(
  client: BaseClient,
  ...keys: RedisKey[]
): Promise<string[]> {
  await (client as any).ensureConnection();
  const normalizedKeys = keys.map(key => (client as any).normalizeKey(key));
  const result = await (client as any).glideClient.sinter(normalizedKeys);
  // GLIDE returns Set<GlideString>, convert to string array for ioredis compatibility
  return Array.from(result).map(
    (item: any) => ParameterTranslator.convertGlideString(item) || ''
  );
}

export async function sinterstore(
  client: BaseClient,
  destination: RedisKey,
  ...keys: RedisKey[]
): Promise<number> {
  await (client as any).ensureConnection();
  const normalizedDestination = (client as any).normalizeKey(destination);
  const normalizedKeys = keys.map(key => (client as any).normalizeKey(key));
  return await (client as any).glideClient.sinterstore(
    normalizedDestination,
    normalizedKeys
  );
}

export async function sdiff(
  client: BaseClient,
  ...keys: RedisKey[]
): Promise<string[]> {
  await (client as any).ensureConnection();
  const normalizedKeys = keys.map(key => (client as any).normalizeKey(key));
  const result = await (client as any).glideClient.sdiff(normalizedKeys);
  // GLIDE returns Set<GlideString>, convert to string array for ioredis compatibility
  return Array.from(result).map(
    (item: any) => ParameterTranslator.convertGlideString(item) || ''
  );
}

export async function sdiffstore(
  client: BaseClient,
  destination: RedisKey,
  ...keys: RedisKey[]
): Promise<number> {
  await (client as any).ensureConnection();
  const normalizedDestination = (client as any).normalizeKey(destination);
  const normalizedKeys = keys.map(key => (client as any).normalizeKey(key));
  return await (client as any).glideClient.sdiffstore(
    normalizedDestination,
    normalizedKeys
  );
}

export async function sunion(
  client: BaseClient,
  ...keys: RedisKey[]
): Promise<string[]> {
  await (client as any).ensureConnection();
  const normalizedKeys = keys.map(key => (client as any).normalizeKey(key));
  const result = await (client as any).glideClient.sunion(normalizedKeys);
  // GLIDE returns Set<GlideString>, convert to string array for ioredis compatibility
  return Array.from(result).map(
    (item: any) => ParameterTranslator.convertGlideString(item) || ''
  );
}

export async function sunionstore(
  client: BaseClient,
  destination: RedisKey,
  ...keys: RedisKey[]
): Promise<number> {
  await (client as any).ensureConnection();
  const normalizedDestination = (client as any).normalizeKey(destination);
  const normalizedKeys = keys.map(key => (client as any).normalizeKey(key));
  return await (client as any).glideClient.sunionstore(
    normalizedDestination,
    normalizedKeys
  );
}

export async function spop(
  client: BaseClient,
  key: RedisKey,
  count?: number
): Promise<string | string[] | null> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  let result;

  if (count === undefined) {
    result = await (client as any).glideClient.spop(normalizedKey);
    return result ? ParameterTranslator.convertGlideString(result) : null;
  } else {
    // Multiple members pop
    result = await (client as any).glideClient.spopCount(normalizedKey, count);
    return Array.from(result).map(
      (item: any) => ParameterTranslator.convertGlideString(item) || ''
    );
  }
}

export async function srandmember(
  client: BaseClient,
  key: RedisKey,
  count?: number
): Promise<string | string[] | null> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  let result;

  if (count === undefined) {
    result = await (client as any).glideClient.srandmember(normalizedKey);
    return result ? ParameterTranslator.convertGlideString(result) : null;
  } else {
    // Multiple members random
    result = await (client as any).glideClient.srandmemberCount(
      normalizedKey,
      count
    );
    return result.map(
      (item: any) => ParameterTranslator.convertGlideString(item) || ''
    );
  }
}
