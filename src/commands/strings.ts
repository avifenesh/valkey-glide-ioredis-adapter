import { TimeUnit } from '@valkey/valkey-glide';
import { BaseClient } from '../BaseClient';
import { ParameterTranslator } from '../utils/ParameterTranslator';
import { RedisKey, RedisValue } from '../types';
import { asInternal } from '../types/internal';

export async function get(
  client: BaseClient,
  key: RedisKey
): Promise<string | null> {
  const internal = asInternal(client);
  await internal.ensureConnection();
  const normalizedKey = internal.normalizeKey(key);
  const result = await internal.glideClient.get(normalizedKey);
  return ParameterTranslator.convertGlideString(result);
}

export async function set(
  client: BaseClient,
  key: RedisKey,
  value: RedisValue,
  ...args: any[]
): Promise<string | null> {
  const internal = asInternal(client);
  await internal.ensureConnection();
  if (key === '' || key === null || key === undefined) {
    throw new Error("ERR invalid key");
  }
  const normalizedKey = internal.normalizeKey(key);
  const normalizedValue = ParameterTranslator.normalizeValue(value);

  const options: any = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (typeof arg === 'object' && arg !== null) {
      if (arg.expiration && typeof arg.expiration === 'object') {
        const exp = arg.expiration;
        if (exp.type === 'EX') {
          options.expiry = { type: TimeUnit.Seconds, count: Number(exp.value) };
        } else if (exp.type === 'PX') {
          options.expiry = {
            type: TimeUnit.Milliseconds,
            count: Number(exp.value),
          };
        } else if (exp.type === 'EXAT') {
          options.expiry = {
            type: TimeUnit.UnixSeconds,
            count: Number(exp.value),
          };
        } else if (exp.type === 'PXAT') {
          options.expiry = {
            type: TimeUnit.UnixMilliseconds,
            count: Number(exp.value),
          };
        }
      }
      if (arg.EX !== undefined) {
        options.expiry = { type: TimeUnit.Seconds, count: Number(arg.EX) };
      } else if (arg.PX !== undefined) {
        options.expiry = { type: TimeUnit.Milliseconds, count: Number(arg.PX) };
      } else if (arg.EXAT !== undefined) {
        options.expiry = {
          type: TimeUnit.UnixSeconds,
          count: Number(arg.EXAT),
        };
      } else if (arg.PXAT !== undefined) {
        options.expiry = {
          type: TimeUnit.UnixMilliseconds,
          count: Number(arg.PXAT),
        };
      } else if (arg.KEEPTTL === true) {
        options.expiry = 'keepExisting';
      }
      if (arg.NX === true) options.conditionalSet = 'onlyIfDoesNotExist';
      if (arg.XX === true) options.conditionalSet = 'onlyIfExists';
      if (arg.GET === true) options.returnOldValue = true;
      continue;
    }

    if (typeof arg === 'string') {
      const option = arg.toUpperCase();
      if (
        (option === 'EX' ||
          option === 'PX' ||
          option === 'EXAT' ||
          option === 'PXAT') &&
        i + 1 < args.length
      ) {
        const optionValue = args[i + 1];
        if (option === 'EX') {
          options.expiry = {
            type: TimeUnit.Seconds,
            count: Number(optionValue),
          };
        } else if (option === 'PX') {
          options.expiry = {
            type: TimeUnit.Milliseconds,
            count: Number(optionValue),
          };
        } else if (option === 'EXAT') {
          options.expiry = {
            type: TimeUnit.UnixSeconds,
            count: Number(optionValue),
          };
        } else if (option === 'PXAT') {
          options.expiry = {
            type: TimeUnit.UnixMilliseconds,
            count: Number(optionValue),
          };
        }
        i++;
      } else if (option === 'NX') {
        options.conditionalSet = 'onlyIfDoesNotExist';
      } else if (option === 'XX') {
        options.conditionalSet = 'onlyIfExists';
      } else if (option === 'KEEPTTL') {
        options.expiry = 'keepExisting';
      } else if (option === 'GET') {
        options.returnOldValue = true;
      }
    }
  }

  const result = await internal.glideClient.set(
    normalizedKey,
    normalizedValue,
    options
  );
  return result === 'OK' ? 'OK' : null;
}

export async function mget(
  client: BaseClient,
  ...keysOrArray: any[]
): Promise<(string | null)[]> {
  const internal = asInternal(client);
  await internal.ensureConnection();
  const keys = Array.isArray(keysOrArray[0]) ? keysOrArray[0] : keysOrArray;
  const normalizedKeys = keys.map((k: RedisKey) => internal.normalizeKey(k));
  const results = await internal.glideClient.mget(normalizedKeys);
  return results.map(ParameterTranslator.convertGlideString);
}

export async function mset(
  client: BaseClient,
  ...argsOrHash: any[]
): Promise<string> {
  const internal = asInternal(client);
  await internal.ensureConnection();
  const keyValuePairs: Record<string, string> = {};
  if (
    argsOrHash.length === 1 &&
    typeof argsOrHash[0] === 'object' &&
    !Array.isArray(argsOrHash[0])
  ) {
    const obj = argsOrHash[0];
    for (const [key, value] of Object.entries(obj)) {
      keyValuePairs[internal.normalizeKey(key)] =
        ParameterTranslator.normalizeValue(value as any);
    }
  } else {
    for (let i = 0; i < argsOrHash.length; i += 2) {
      const key = internal.normalizeKey(argsOrHash[i]);
      const value = ParameterTranslator.normalizeValue(argsOrHash[i + 1]);
      keyValuePairs[key] = value;
    }
  }
  await internal.glideClient.mset(keyValuePairs);
  return 'OK';
}
