import { RedisKey, RedisValue } from '../types';
import { ParameterTranslator } from '../utils/ParameterTranslator';
import { BaseClient } from '../BaseClient';

export async function zadd(
  client: BaseClient,
  key: RedisKey,
  ...args: any[]
): Promise<number> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);

  // Parse ioredis style: [NX|XX] [CH] [INCR] score member [score member ...]
  const options: any = {};
  const members: { score: number; member: string }[] = [];

  let i = 0;
  while (i < args.length) {
    const arg = String(args[i]).toUpperCase();
    if (arg === 'NX') {
      options.conditionalChange = 'only_if_not_exists';
      i++;
    } else if (arg === 'XX') {
      options.conditionalChange = 'only_if_exists';
      i++;
    } else if (arg === 'CH') {
      options.change = true;
      i++;
    } else if (arg === 'INCR') {
      options.increment = true;
      i++;
    } else {
      // Score and member pair
      if (i + 1 < args.length) {
        const score = Number(args[i]);
        const member = String(args[i + 1]);
        members.push({ score, member });
        i += 2;
      } else {
        break;
      }
    }
  }

  if (options.increment && members.length === 1) {
    // ZADD with INCR
    const member = members[0];
    if (member) {
      const result = await (client as any).glideClient.zaddIncr(
        normalizedKey,
        ParameterTranslator.normalizeValue(member.member),
        member.score,
        options
      );
      return result || 0;
    }
    return 0;
  } else {
    // Regular ZADD
    const memberScores = members.map(m => ({
      element: ParameterTranslator.normalizeValue(m.member),
      score: m.score,
    }));
    return await (client as any).glideClient.zadd(
      normalizedKey,
      memberScores,
      options
    );
  }
}

export async function zrem(
  client: BaseClient,
  key: RedisKey,
  ...members: RedisValue[]
): Promise<number> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const normalizedMembers = members.map(ParameterTranslator.normalizeValue);
  return await (client as any).glideClient.zrem(
    normalizedKey,
    normalizedMembers
  );
}

export async function zcard(
  client: BaseClient,
  key: RedisKey
): Promise<number> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  return await (client as any).glideClient.zcard(normalizedKey);
}

export async function zscore(
  client: BaseClient,
  key: RedisKey,
  member: RedisValue
): Promise<string | null> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const normalizedMember = ParameterTranslator.normalizeValue(member);
  const result = await (client as any).glideClient.zscore(
    normalizedKey,
    normalizedMember
  );
  return result ? result.toString() : null;
}

export async function zmscore(
  client: BaseClient,
  key: RedisKey,
  members: RedisValue[]
): Promise<(string | null)[]> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const normalizedMembers = members.map(ParameterTranslator.normalizeValue);
  const results = await (client as any).glideClient.zmscore(
    normalizedKey,
    normalizedMembers
  );
  return results.map((score: any) => (score ? score.toString() : null));
}

export async function zrank(
  client: BaseClient,
  key: RedisKey,
  member: RedisValue
): Promise<number | null> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const normalizedMember = ParameterTranslator.normalizeValue(member);
  return await (client as any).glideClient.zrank(
    normalizedKey,
    normalizedMember
  );
}

export async function zrevrank(
  client: BaseClient,
  key: RedisKey,
  member: RedisValue
): Promise<number | null> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const normalizedMember = ParameterTranslator.normalizeValue(member);
  return await (client as any).glideClient.zrevrank(
    normalizedKey,
    normalizedMember
  );
}

export async function zrange(
  client: BaseClient,
  key: RedisKey,
  start: number,
  stop: number,
  withScores?: boolean
): Promise<string[]> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const rangeQuery = {
    type: 'byIndex' as const,
    start,
    end: stop,
  };

  let result: any;
  if (withScores) {
    result = await (client as any).glideClient.zrangeWithScores(
      normalizedKey,
      rangeQuery
    );
    // GLIDE returns array of objects with {element, score} - convert to ioredis flat format
    const flattened: string[] = [];
    for (const item of result) {
      flattened.push(
        ParameterTranslator.convertGlideString(item.element) || ''
      );
      flattened.push(item.score.toString());
    }
    return flattened;
  } else {
    result = await (client as any).glideClient.zrange(
      normalizedKey,
      rangeQuery
    );
    return result.map(
      (item: any) => ParameterTranslator.convertGlideString(item) || ''
    );
  }
}

export async function zrevrange(
  client: BaseClient,
  key: RedisKey,
  start: number,
  stop: number,
  withScores?: boolean
): Promise<string[]> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const rangeQuery = {
    type: 'byIndex' as const,
    start,
    end: stop,
  };

  let result: any;
  if (withScores) {
    result = await (client as any).glideClient.zrangeWithScores(
      normalizedKey,
      rangeQuery,
      {
        reverse: true,
      }
    );
  } else {
    result = await (client as any).glideClient.zrange(
      normalizedKey,
      rangeQuery,
      {
        reverse: true,
      }
    );
  }

  return result.map(
    (item: any) => ParameterTranslator.convertGlideString(item) || ''
  );
}

export async function zrangebylex(
  client: BaseClient,
  key: RedisKey,
  min: string,
  max: string,
  ...args: string[]
): Promise<string[]> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);

  // Parse lex boundaries for GLIDE RangeByLex
  const parseLex = (b: string): any => {
    if (b === '-') return { value: '-' as any, isInclusive: true };
    if (b === '+') return { value: '+' as any, isInclusive: true };
    if (b.startsWith('(')) {
      return { value: b.slice(1), isInclusive: false };
    }
    return { value: b, isInclusive: true };
  };

  const rangeQuery: any = {
    type: 'byLex',
    start: parseLex(String(min)),
    end: parseLex(String(max)),
  };

  // LIMIT support
  for (let i = 0; i < args.length; i++) {
    const currentArg = args[i];
    if (
      currentArg &&
      currentArg.toString().toUpperCase() === 'LIMIT' &&
      i + 2 < args.length
    ) {
      const offsetArg = args[i + 1];
      const countArg = args[i + 2];
      if (offsetArg !== undefined && countArg !== undefined) {
        rangeQuery.limit = {
          offset: parseInt(offsetArg.toString()),
          count: parseInt(countArg.toString()),
        };
        break;
      }
    }
  }

  const result = await (client as any).glideClient.zrange(
    normalizedKey,
    rangeQuery
  );
  if (!Array.isArray(result)) return [];
  return result.map(
    (item: any) => ParameterTranslator.convertGlideString(item) || ''
  );
}

export async function zrevrangebylex(
  client: BaseClient,
  key: RedisKey,
  max: string,
  min: string,
  ...args: string[]
): Promise<string[]> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);

  // Parse lex boundaries for GLIDE RangeByLex
  const parseLex = (b: string): any => {
    if (b === '-') return { value: '-' as any, isInclusive: true };
    if (b === '+') return { value: '+' as any, isInclusive: true };
    if (b.startsWith('(')) {
      return { value: b.slice(1), isInclusive: false };
    }
    return { value: b, isInclusive: true };
  };

  const rangeQuery: any = {
    type: 'byLex',
    start: parseLex(String(min)),
    end: parseLex(String(max)),
  };

  // LIMIT support
  for (let i = 0; i < args.length; i++) {
    const currentArg = args[i];
    if (
      currentArg &&
      currentArg.toString().toUpperCase() === 'LIMIT' &&
      i + 2 < args.length
    ) {
      const offsetArg = args[i + 1];
      const countArg = args[i + 2];
      if (offsetArg !== undefined && countArg !== undefined) {
        rangeQuery.limit = {
          offset: parseInt(offsetArg.toString()),
          count: parseInt(countArg.toString()),
        };
        break;
      }
    }
  }

  // Reverse using GLIDE reverse flag
  const result = await (client as any).glideClient.zrange(
    normalizedKey,
    rangeQuery,
    { reverse: true }
  );
  if (!Array.isArray(result)) return [];
  return result.map(
    (item: any) => ParameterTranslator.convertGlideString(item) || ''
  );
}

export async function zpopmin(
  client: BaseClient,
  key: RedisKey,
  count?: number
): Promise<string[]> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const options = count !== undefined ? { count } : undefined;
  const result = await (client as any).glideClient.zpopmin(
    normalizedKey,
    options
  );

  if (Array.isArray(result)) {
    // GLIDE returns [{element: string, score: number}, ...]
    const converted: string[] = [];
    for (const item of result) {
      if (
        item &&
        typeof item === 'object' &&
        'element' in item &&
        'score' in item
      ) {
        converted.push(
          ParameterTranslator.convertGlideString(item.element) || '',
          item.score.toString()
        );
      }
    }
    return converted;
  }

  return [];
}

export async function zpopmax(
  client: BaseClient,
  key: RedisKey,
  count?: number
): Promise<string[]> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const options = count !== undefined ? { count } : undefined;
  const result = await (client as any).glideClient.zpopmax(
    normalizedKey,
    options
  );

  if (Array.isArray(result)) {
    // GLIDE returns [{element: string, score: number}, ...]
    const converted: string[] = [];
    for (const item of result) {
      if (
        item &&
        typeof item === 'object' &&
        'element' in item &&
        'score' in item
      ) {
        converted.push(
          ParameterTranslator.convertGlideString(item.element) || '',
          item.score.toString()
        );
      }
    }
    return converted;
  }

  return [];
}

export async function zrandmember(
  client: BaseClient,
  key: RedisKey,
  count?: number,
  withScores?: boolean
): Promise<string | string[]> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);

  if (count === undefined) {
    const result = await (client as any).glideClient.zrandmember(normalizedKey);
    return ParameterTranslator.convertGlideString(result) || '';
  } else {
    if (withScores) {
      const list = await (
        (client as any).glideClient as any
      ).zrandmemberWithCountWithScores(normalizedKey, count);
      const flat: string[] = [];
      for (const [member, score] of list) {
        flat.push(
          ParameterTranslator.convertGlideString(member) || '',
          String(score)
        );
      }
      return flat;
    } else {
      const list = await (
        (client as any).glideClient as any
      ).zrandmemberWithCount(normalizedKey, count);
      return list.map(
        (m: any) => ParameterTranslator.convertGlideString(m) || ''
      );
    }
  }
}

export async function zincrby(
  client: BaseClient,
  key: RedisKey,
  increment: number,
  member: RedisValue
): Promise<string> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  const normalizedMember = ParameterTranslator.normalizeValue(member);
  const result = await (client as any).glideClient.zincrby(
    normalizedKey,
    increment,
    normalizedMember
  );
  return result.toString();
}

export async function zcount(
  client: BaseClient,
  key: RedisKey,
  min: number | string,
  max: number | string
): Promise<number> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);

  let minBoundary: { value: number | string; isInclusive: boolean };
  let maxBoundary: { value: number | string; isInclusive: boolean };

  // Parse min boundary
  if (typeof min === 'string') {
    if (min.startsWith('(')) {
      minBoundary = { value: min.slice(1), isInclusive: false };
    } else if (min === '-inf') {
      minBoundary = { value: '-inf', isInclusive: true };
    } else {
      minBoundary = { value: min, isInclusive: true };
    }
  } else {
    minBoundary = { value: min, isInclusive: true };
  }

  // Parse max boundary
  if (typeof max === 'string') {
    if (max.startsWith('(')) {
      maxBoundary = { value: max.slice(1), isInclusive: false };
    } else if (max === '+inf') {
      maxBoundary = { value: '+inf', isInclusive: true };
    } else {
      maxBoundary = { value: max, isInclusive: true };
    }
  } else {
    maxBoundary = { value: max, isInclusive: true };
  }

  return await (client as any).glideClient.zcount(
    normalizedKey,
    minBoundary as any,
    maxBoundary as any
  );
}

export async function zremrangebyrank(
  client: BaseClient,
  key: RedisKey,
  start: number,
  stop: number
): Promise<number> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);
  return await (client as any).glideClient.zremRangeByRank(
    normalizedKey,
    start,
    stop
  );
}

export async function zremrangebyscore(
  client: BaseClient,
  key: RedisKey,
  min: number | string,
  max: number | string
): Promise<number> {
  await (client as any).ensureConnection();
  const normalizedKey = (client as any).normalizeKey(key);

  let minBoundary: any;
  let maxBoundary: any;

  // Parse min boundary
  if (typeof min === 'string') {
    if (min.startsWith('(')) {
      minBoundary = { value: parseFloat(min.slice(1)), isInclusive: false };
    } else if (min === '-inf') {
      minBoundary = { value: '-inf' as any, isInclusive: true };
    } else {
      minBoundary = { value: parseFloat(min), isInclusive: true };
    }
  } else {
    minBoundary = { value: min, isInclusive: true };
  }

  // Parse max boundary
  if (typeof max === 'string') {
    if (max.startsWith('(')) {
      maxBoundary = { value: parseFloat(max.slice(1)), isInclusive: false };
    } else if (max === '+inf') {
      maxBoundary = { value: '+inf' as any, isInclusive: true };
    } else {
      maxBoundary = { value: parseFloat(max), isInclusive: true };
    }
  } else {
    maxBoundary = { value: max, isInclusive: true };
  }

  return await (client as any).glideClient.zremRangeByScore(
    normalizedKey,
    minBoundary,
    maxBoundary
  );
}

// === ZSET algebra and STORE variants ===
function parseWeightsAndAgg(
  keys: string[],
  tokens: any[]
): {
  weighted: [string, number][] | null;
  agg?: 'SUM' | 'MIN' | 'MAX';
} {
  let weights: number[] | null = null;
  let agg: 'SUM' | 'MIN' | 'MAX' | undefined;
  for (let i = 0; i < tokens.length; i++) {
    const token = String(tokens[i]).toUpperCase();
    if (token === 'WEIGHTS') {
      const w: number[] = [];
      for (let j = 0; j < keys.length && i + 1 + j < tokens.length; j++) {
        w.push(Number(tokens[i + 1 + j]));
      }
      i += keys.length; // advance past weights
      weights = w;
    } else if (token === 'AGGREGATE' && i + 1 < tokens.length) {
      const a = String(tokens[i + 1]).toUpperCase();
      if (a === 'SUM' || a === 'MIN' || a === 'MAX') agg = a;
      i += 1;
    }
    // WITHSCORES handled by caller; ignore here
  }

  if (weights) {
    const weighted: [string, number][] = keys.map((k, idx) => [
      k,
      weights![idx] ?? 1,
    ]);
    const res: {
      weighted: [string, number][] | null;
      agg?: 'SUM' | 'MIN' | 'MAX';
    } = { weighted };
    if (agg !== undefined) res.agg = agg;
    return res;
  }
  const res: {
    weighted: [string, number][] | null;
    agg?: 'SUM' | 'MIN' | 'MAX';
  } = { weighted: null };
  if (agg !== undefined) res.agg = agg;
  return res;
}

export async function zunionstore(
  client: BaseClient,
  destination: RedisKey,
  numKeys: number,
  ...args: any[]
): Promise<number> {
  await (client as any).ensureConnection();
  const dest = (client as any).normalizeKey(destination);
  const keyArgs = args
    .slice(0, numKeys)
    .map((k: any) => (client as any).normalizeKey(String(k)));
  const options = args.slice(numKeys);
  const { weighted, agg } = parseWeightsAndAgg(keyArgs, options);

  if (weighted) {
    return await ((client as any).glideClient as any).zunionstore(
      dest,
      weighted,
      agg ? { aggregationType: agg } : undefined
    );
  }
  return await ((client as any).glideClient as any).zunionstore(
    dest,
    keyArgs,
    agg ? { aggregationType: agg } : undefined
  );
}

export async function zinterstore(
  client: BaseClient,
  destination: RedisKey,
  numKeys: number,
  ...args: any[]
): Promise<number> {
  await (client as any).ensureConnection();
  const dest = (client as any).normalizeKey(destination);
  const keyArgs = args
    .slice(0, numKeys)
    .map((k: any) => (client as any).normalizeKey(String(k)));
  const options = args.slice(numKeys);
  const { weighted, agg } = parseWeightsAndAgg(keyArgs, options);

  if (weighted) {
    return await ((client as any).glideClient as any).zinterstore(
      dest,
      weighted,
      agg ? { aggregationType: agg } : undefined
    );
  }
  return await ((client as any).glideClient as any).zinterstore(
    dest,
    keyArgs,
    agg ? { aggregationType: agg } : undefined
  );
}

export async function zdiffstore(
  client: BaseClient,
  destination: RedisKey,
  numKeys: number,
  ...args: any[]
): Promise<number> {
  await (client as any).ensureConnection();
  const dest = (client as any).normalizeKey(destination);
  const keyArgs = args
    .slice(0, numKeys)
    .map((k: any) => (client as any).normalizeKey(String(k)));
  return await ((client as any).glideClient as any).zdiffstore(dest, keyArgs);
}

export async function zunion(
  client: BaseClient,
  ...args: any[]
): Promise<string[] | string[]> {
  await (client as any).ensureConnection();
  // Redis 6.2+: ZUNION numkeys key [key ...] [WEIGHTS ...] [AGGREGATE ...] [WITHSCORES]
  if (args.length < 2) return [];
  const numKeys = Number(args[0]);
  const keyArgs = args
    .slice(1, 1 + numKeys)
    .map((k: any) => (client as any).normalizeKey(String(k)));
  const tail = args
    .slice(1 + numKeys)
    .map((a: any) => (typeof a === 'string' ? a : String(a)));
  const withScores = tail.some(
    (t: any) => String(t).toUpperCase() === 'WITHSCORES'
  );
  const { weighted, agg } = parseWeightsAndAgg(keyArgs, tail);

  if (withScores) {
    const list = await ((client as any).glideClient as any).zunionWithScores(
      weighted || keyArgs,
      agg ? { aggregationType: agg } : undefined
    );
    const flat: string[] = [];
    for (const item of list) {
      if (
        item &&
        typeof item === 'object' &&
        'element' in item &&
        'score' in item
      ) {
        flat.push(String(item.element), String(item.score));
      }
    }
    return flat;
  }
  const res = await ((client as any).glideClient as any).zunion(keyArgs);
  return res.map((x: any) => ParameterTranslator.convertGlideString(x) || '');
}

export async function zinter(
  client: BaseClient,
  ...args: any[]
): Promise<string[] | string[]> {
  await (client as any).ensureConnection();
  if (args.length < 2) return [];
  const numKeys = Number(args[0]);
  const keyArgs = args
    .slice(1, 1 + numKeys)
    .map((k: any) => (client as any).normalizeKey(String(k)));
  const tail = args
    .slice(1 + numKeys)
    .map((a: any) => (typeof a === 'string' ? a : String(a)));
  const withScores = tail.some(
    (t: any) => String(t).toUpperCase() === 'WITHSCORES'
  );
  const { weighted, agg } = parseWeightsAndAgg(keyArgs, tail);

  if (withScores) {
    const list = await ((client as any).glideClient as any).zinterWithScores(
      weighted || keyArgs,
      agg ? { aggregationType: agg } : undefined
    );
    const flat: string[] = [];
    for (const item of list) {
      if (
        item &&
        typeof item === 'object' &&
        'element' in item &&
        'score' in item
      ) {
        flat.push(String(item.element), String(item.score));
      }
    }
    return flat;
  }
  const res = await ((client as any).glideClient as any).zinter(keyArgs);
  return res.map((x: any) => ParameterTranslator.convertGlideString(x) || '');
}

export async function zdiff(
  client: BaseClient,
  ...args: any[]
): Promise<string[] | string[]> {
  await (client as any).ensureConnection();
  if (args.length < 2) return [];
  const numKeys = Number(args[0]);
  const keyArgs = args
    .slice(1, 1 + numKeys)
    .map((k: any) => (client as any).normalizeKey(String(k)));
  const tail = args
    .slice(1 + numKeys)
    .map((a: any) => (typeof a === 'string' ? a : String(a)));
  const withScores = tail.some(
    (t: any) => String(t).toUpperCase() === 'WITHSCORES'
  );
  if (withScores) {
    const list = await ((client as any).glideClient as any).zdiffWithScores(
      keyArgs
    );
    const flat: string[] = [];
    for (const item of list) {
      if (
        item &&
        typeof item === 'object' &&
        'element' in item &&
        'score' in item
      ) {
        flat.push(String(item.element), String(item.score));
      }
    }
    return flat;
  }
  const res = await ((client as any).glideClient as any).zdiff(keyArgs);
  return res.map((x: any) => ParameterTranslator.convertGlideString(x) || '');
}
