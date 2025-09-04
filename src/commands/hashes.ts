import { BaseClient } from '../BaseClient';
import { RedisKey, RedisValue } from '../types';
import { ParameterTranslator } from '../utils/ParameterTranslator';

export async function hget(
  client: BaseClient,
  key: RedisKey,
  field: string
): Promise<string | null> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const result = await (client as any).glideClient.hget(normalizedKey, field);
  return ParameterTranslator.convertGlideString(result);
}

export async function hset(
  client: BaseClient,
  key: RedisKey,
  ...args: any[]
): Promise<number> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const fieldValuePairs: Record<string, string> = {};
  if (
    args.length === 1 &&
    typeof args[0] === 'object' &&
    !Array.isArray(args[0])
  ) {
    const obj = args[0];
    for (const [field, value] of Object.entries(obj)) {
      fieldValuePairs[field] = ParameterTranslator.normalizeValue(
        value as RedisValue
      );
    }
  } else {
    for (let i = 0; i < args.length; i += 2) {
      if (i + 1 < args.length) {
        const field = args[i].toString();
        const value = ParameterTranslator.normalizeValue(args[i + 1]);
        fieldValuePairs[field] = value;
      }
    }
  }
  return await (client as any).glideClient.hset(normalizedKey, fieldValuePairs);
}

export async function hgetall(
  client: BaseClient,
  key: RedisKey
): Promise<Record<string, string>> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const result = await (client as any).glideClient.hgetall(normalizedKey);
  if (Array.isArray(result)) {
    const converted: Record<string, string> = {};
    for (const item of result) {
      if (
        item &&
        typeof item === 'object' &&
        'field' in item &&
        'value' in item
      ) {
        const field =
          ParameterTranslator.convertGlideString((item as any).field) || '';
        const value =
          ParameterTranslator.convertGlideString((item as any).value) || '';
        converted[field] = value;
      }
    }
    return converted;
  }
  return {};
}

export async function hmset(
  client: BaseClient,
  key: RedisKey,
  ...args: any[]
): Promise<string> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const fieldValuePairs: Record<string, string> = {};
  if (
    args.length === 1 &&
    typeof args[0] === 'object' &&
    !Array.isArray(args[0])
  ) {
    const obj = args[0];
    for (const [field, value] of Object.entries(obj)) {
      fieldValuePairs[field] = ParameterTranslator.normalizeValue(
        value as RedisValue
      );
    }
  } else {
    for (let i = 0; i < args.length; i += 2) {
      if (i + 1 < args.length) {
        const field = args[i].toString();
        const value = ParameterTranslator.normalizeValue(args[i + 1]);
        fieldValuePairs[field] = value;
      }
    }
  }
  await (client as any).glideClient.hset(normalizedKey, fieldValuePairs);
  return 'OK';
}

export async function hmget(
  client: BaseClient,
  key: RedisKey,
  ...fieldsOrArray: any[]
): Promise<(string | null)[]> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const fields = Array.isArray(fieldsOrArray[0])
    ? fieldsOrArray[0]
    : fieldsOrArray;
  const results = await (client as any).glideClient.hmget(
    normalizedKey,
    fields
  );
  return results.map(ParameterTranslator.convertGlideString);
}

export async function hdel(
  client: BaseClient,
  key: RedisKey,
  ...fields: string[]
): Promise<number> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  return await (client as any).glideClient.hdel(normalizedKey, fields);
}

export async function hexists(
  client: BaseClient,
  key: RedisKey,
  field: string
): Promise<number> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const result = await (client as any).glideClient.hexists(
    normalizedKey,
    field
  );
  return result ? 1 : 0;
}

export async function hkeys(
  client: BaseClient,
  key: RedisKey
): Promise<string[]> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const results = await (client as any).glideClient.hkeys(normalizedKey);
  return results.map(
    (r: any) => ParameterTranslator.convertGlideString(r) || ''
  );
}

export async function hvals(
  client: BaseClient,
  key: RedisKey
): Promise<string[]> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const results = await (client as any).glideClient.hvals(normalizedKey);
  return results.map(
    (r: any) => ParameterTranslator.convertGlideString(r) || ''
  );
}

export async function hstrlen(
  client: BaseClient,
  key: RedisKey,
  field: string
): Promise<number> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  return await (client as any).glideClient.hstrlen(normalizedKey, field);
}

export async function hrandfield(
  client: BaseClient,
  key: RedisKey,
  count?: number,
  withValues?: 'WITHVALUES'
): Promise<string | string[] | Array<string | number> | null> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  if (count === undefined) {
    const res = await (client as any).glideClient.hrandfield(normalizedKey);
    return ParameterTranslator.convertGlideString(res);
  }
  if (withValues && withValues.toUpperCase() === 'WITHVALUES') {
    const pairs = await (client as any).glideClient.hrandfieldWithValues(
      normalizedKey,
      count
    );
    const flat: string[] = [];
    for (const [f, v] of pairs) {
      flat.push(
        ParameterTranslator.convertGlideString(f) || '',
        ParameterTranslator.convertGlideString(v) || ''
      );
    }
    return flat;
  }
  const fields = await (client as any).glideClient.hrandfieldCount(
    normalizedKey,
    count
  );
  return fields.map(
    (f: any) => ParameterTranslator.convertGlideString(f) || ''
  );
}

export async function hlen(client: BaseClient, key: RedisKey): Promise<number> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  return await (client as any).glideClient.hlen(normalizedKey);
}

export async function hincrby(
  client: BaseClient,
  key: RedisKey,
  field: string,
  increment: number
): Promise<number> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  return await (client as any).glideClient.hincrBy(
    normalizedKey,
    field,
    increment
  );
}

export async function hincrbyfloat(
  client: BaseClient,
  key: RedisKey,
  field: string,
  increment: number
): Promise<number> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const result = await (client as any).glideClient.hincrByFloat(
    normalizedKey,
    field,
    increment
  );
  return parseFloat(result.toString());
}

export async function hsetnx(
  client: BaseClient,
  key: RedisKey,
  field: string,
  value: RedisValue
): Promise<number> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const normalizedValue = ParameterTranslator.normalizeValue(value);
  const result = await (client as any).glideClient.hsetnx(
    normalizedKey,
    field,
    normalizedValue
  );
  return result ? 1 : 0;
}

