/**
 * Parameter Translation Utilities
 *
 * Translates between ioredis parameter formats and Valkey GLIDE parameter formats,
 * ensuring seamless API compatibility while leveraging GLIDE's native performance.
 */

import { RedisKey, RedisValue } from '../types';
import { TimeUnit } from '@valkey/valkey-glide';

export class ParameterTranslator {
  // Performance optimization: Cache for frequently used parameter translations
  private static readonly setOptionsCache = new Map<string, any>();
  private static readonly MAX_CACHE_SIZE = 1000; // Prevent unbounded memory growth
  /**
   * Converts SET command arguments from ioredis format to GLIDE format.
   * @param args - ioredis SET arguments: key, value, [EX seconds], [PX milliseconds], [NX|XX]
   * @returns GLIDE-compatible object with key, value, and optional options
   */
  static translateSetArgs(args: any[]): {
    key: string;
    value: string;
    options?: any;
  } {
    if (args.length < 2) {
      throw new Error('SET requires at least 2 arguments: key and value');
    }

    const [key, value, ...optionArgs] = args;

    if (!key && key !== 0) {
      throw new Error("ERR wrong number of arguments for 'set' command");
    }

    const result = {
      key: key.toString(),
      value: value.toString(),
      options: this.parseSetOptions(optionArgs),
    };

    return result;
  }

  /**
   * Parses SET command options from various formats.
   * @param args - Option arguments in ioredis format
   * @returns GLIDE-compatible options object or undefined
   * @private
   */
  static parseSetOptions(args: any[]): any {
    if (args.length === 0) return undefined;

    // Performance optimization: Check cache first
    const cacheKey = JSON.stringify(args);
    const cached = this.setOptionsCache.get(cacheKey);
    if (cached !== undefined) {
      return cached === null ? undefined : cached;
    }

    const options: any = {};

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      // Handle connect-redis object format: { expiration: { type: 'EX', value: 3600 } }
      if (typeof arg === 'object' && arg !== null && !Array.isArray(arg)) {
        if (arg.expiration) {
          const expiration = arg.expiration;
          if (expiration.type && expiration.value !== undefined) {
            switch (expiration.type.toUpperCase()) {
              case 'EX':
                options.expiry = {
                  type: TimeUnit.Seconds,
                  count: parseInt(expiration.value, 10),
                };
                break;
              case 'PX':
                options.expiry = {
                  type: TimeUnit.Milliseconds,
                  count: parseInt(expiration.value, 10),
                };
                break;
            }
          }
        }
        if (arg.conditionalSet) {
          options.conditionalSet = arg.conditionalSet;
        }
        if (arg.returnOldValue) {
          options.returnOldValue = arg.returnOldValue;
        }
      } else if (typeof arg === 'string') {
        const upperArg = arg.toUpperCase();

        switch (upperArg) {
          case 'EX':
            if (i + 1 < args.length) {
              options.expiry = {
                type: TimeUnit.Seconds,
                count: parseInt(args[++i], 10),
              };
            }
            break;
          case 'PX':
            if (i + 1 < args.length) {
              options.expiry = {
                type: TimeUnit.Milliseconds,
                count: parseInt(args[++i], 10),
              };
            }
            break;
          case 'NX':
            options.conditionalSet = 'onlyIfDoesNotExist';
            break;
          case 'XX':
            options.conditionalSet = 'onlyIfExists';
            break;
          case 'GET':
            options.returnOldValue = true;
            break;
        }
      }
    }

    const result = Object.keys(options).length > 0 ? options : undefined;

    // Cache the result for future use
    if (this.setOptionsCache.size >= this.MAX_CACHE_SIZE) {
      // Clear cache if it gets too large (simple LRU-like behavior)
      const firstKey = this.setOptionsCache.keys().next().value;
      if (firstKey !== undefined) {
        this.setOptionsCache.delete(firstKey);
      }
    }
    this.setOptionsCache.set(cacheKey, result === undefined ? null : result);

    return result;
  }

  /**
   * Converts MGET arguments to GLIDE format.
   * @param args - Keys in variadic or array format
   * @returns Array of key strings
   */
  static translateMGetArgs(args: any[]): string[] {
    if (args.length === 0) {
      throw new Error('MGET requires at least 1 key');
    }

    const keys = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
    return keys.map((key: RedisKey) => key.toString());
  }

  /**
   * Converts MSET arguments to GLIDE format.
   * @param args - Key-value pairs in variadic or object format
   * @returns Object mapping keys to values
   */
  static translateMSetArgs(args: any[]): Record<string, string> {
    if (args.length === 0) {
      throw new Error('MSET requires at least 1 key-value pair');
    }

    if (
      args.length === 1 &&
      typeof args[0] === 'object' &&
      !Array.isArray(args[0])
    ) {
      const result: Record<string, string> = {};
      for (const [key, value] of Object.entries(args[0])) {
        result[key] = String(value);
      }
      return result;
    }

    if (args.length % 2 !== 0) {
      throw new Error(
        'MSET requires an even number of arguments (key-value pairs)'
      );
    }

    const result: Record<string, string> = {};
    for (let i = 0; i < args.length; i += 2) {
      result[args[i].toString()] = args[i + 1].toString();
    }

    return result;
  }

  /**
   * Converts HSET arguments to GLIDE format.
   * @param args - Key, field-value pairs in variadic or object format
   * @returns Object with key and field-value mapping
   */
  static translateHSetArgs(args: any[]): {
    key: string;
    fieldValues: Record<string, string>;
  } {
    if (
      args.length < 3 &&
      !(args.length === 2 && typeof args[1] === 'object')
    ) {
      throw new Error('HSET requires at least 3 arguments: key, field, value');
    }

    const [key, ...rest] = args;

    if (
      rest.length === 1 &&
      typeof rest[0] === 'object' &&
      !Array.isArray(rest[0])
    ) {
      const fieldValues: Record<string, string> = {};
      for (const [field, value] of Object.entries(rest[0])) {
        fieldValues[field] = String(value);
      }
      return { key: key.toString(), fieldValues };
    }

    if (rest.length % 2 !== 0) {
      throw new Error('HSET requires an even number of field-value arguments');
    }

    const fieldValues: Record<string, string> = {};
    for (let i = 0; i < rest.length; i += 2) {
      fieldValues[rest[i].toString()] = rest[i + 1].toString();
    }

    return { key: key.toString(), fieldValues };
  }

  /**
   * Converts HMGET arguments to GLIDE format.
   * @param args - Key and fields in variadic or array format
   * @returns Object with key and fields array
   */
  static translateHMGetArgs(args: any[]): {
    key: string;
    fields: string[];
  } {
    if (args.length < 2) {
      throw new Error('HMGET requires at least 2 arguments: key and field');
    }

    const [key, ...rest] = args;

    const fields = rest.length === 1 && Array.isArray(rest[0]) ? rest[0] : rest;
    return {
      key: key.toString(),
      fields: fields.map((field: string) => field.toString()),
    };
  }

  /**
   * Converts list push arguments to GLIDE format.
   * @param args - Key and elements in variadic or array format
   * @returns Object with key and elements array
   */
  static translateListPushArgs(args: any[]): {
    key: string;
    elements: string[];
  } {
    if (args.length < 2) {
      throw new Error(
        'List push requires at least 2 arguments: key and element'
      );
    }

    const [key, ...rest] = args;

    const elements =
      rest.length === 1 && Array.isArray(rest[0]) ? rest[0] : rest;
    return {
      key: key.toString(),
      elements: elements.map((element: RedisValue) => element.toString()),
    };
  }

  /**
   * Converts DEL arguments to GLIDE format.
   * @param args - Keys in variadic format
   * @returns Array of key strings
   */
  static translateDelArgs(args: any[]): string[] {
    if (args.length === 0) {
      throw new Error('DEL requires at least 1 key');
    }

    return args.map((key: RedisKey) => key.toString());
  }

  /**
   * Converts EXISTS arguments to GLIDE format.
   * @param args - Keys in variadic format
   * @returns Array of key strings
   */
  static translateExistsArgs(args: any[]): string[] {
    if (args.length === 0) {
      throw new Error('EXISTS requires at least 1 key');
    }

    return args.map((key: RedisKey) => key.toString());
  }

  /**
   * Converts TimeUnit strings to GLIDE TimeUnit enum values.
   * @param unit - Time unit string (EX, PX, SECONDS, MILLISECONDS)
   * @returns GLIDE TimeUnit string
   */
  static convertTimeUnit(unit: string): string {
    switch (unit.toUpperCase()) {
      case 'EX':
      case 'SECONDS':
        return 'Seconds';
      case 'PX':
      case 'MILLISECONDS':
        return 'Milliseconds';
      default:
        throw new Error(`Unknown time unit: ${unit}`);
    }
  }

  /**
   * Converts conditional set options to GLIDE format.
   * @param condition - Conditional set string (NX, XX)
   * @returns GLIDE conditional set string
   */
  static convertConditionalSet(condition: string): string {
    switch (condition.toUpperCase()) {
      case 'NX':
        return 'onlyIfDoesNotExist';
      case 'XX':
        return 'onlyIfExists';
      default:
        throw new Error(`Unknown conditional set option: ${condition}`);
    }
  }

  /**
   * Normalizes Redis key to string format.
   * @param key - Redis key in various formats
   * @returns String representation of the key
   */
  static normalizeKey(key: RedisKey): string {
    return key.toString();
  }

  /**
   * Normalizes Redis value to string format.
   * @param value - Redis value in various formats
   * @returns String representation of the value
   */
  static normalizeValue(value: RedisValue): string {
    return value.toString();
  }

  /**
   * Converts GlideString to string.
   * @param value - GLIDE string value
   * @returns String or null
   */
  static convertGlideString(value: any): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    return value.toString();
  }

  /**
   * Converts GlideString array to string array.
   * @param values - Array of GLIDE string values
   * @returns Array of strings or nulls
   */
  static convertGlideStringArray(values: any[]): (string | null)[] {
    return values.map(value => this.convertGlideString(value));
  }

  /**
   * Converts GlideRecord to plain object.
   * @param record - GLIDE record object
   * @returns Plain JavaScript object
   */
  static convertGlideRecord(record: any): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(record)) {
      result[key] = value?.toString() || '';
    }
    return result;
  }

  /**
   * Parses score boundary value for ZSET operations.
   * @param score - Score value as string or number
   * @returns Parsed numeric score
   */
  static parseScoreValue(score: string | number): number {
    if (typeof score === 'number') return score;
    const scoreStr = score.toString();
    if (scoreStr === '+inf') return Infinity;
    if (scoreStr === '-inf') return -Infinity;
    if (scoreStr.startsWith('(+inf')) return Infinity;
    if (scoreStr.startsWith('(-inf')) return -Infinity;
    if (scoreStr.startsWith('(')) return parseFloat(scoreStr.slice(1));
    return parseFloat(scoreStr);
  }

  /**
   * Creates boundary for ZSET range operations.
   * @param bound - Boundary value (may include exclusive prefix)
   * @returns Boundary object with value and inclusiveness flag
   */
  static createScoreBoundary(bound: string | number): {
    value: number;
    isInclusive: boolean;
  } {
    if (typeof bound === 'string' && bound.startsWith('(')) {
      return {
        value: this.parseScoreValue(bound.slice(1)),
        isInclusive: false,
      };
    }
    return {
      value: this.parseScoreValue(bound),
      isInclusive: true,
    };
  }

  /**
   * Parses HSET command arguments to field-value pairs.
   * @param args - Field-value arguments in various formats
   * @returns Object mapping fields to values
   */
  static parseHashSetArgs(args: any[]): Record<string, string> {
    const fieldValues: Record<string, string> = {};

    if (
      args.length === 1 &&
      typeof args[0] === 'object' &&
      !Buffer.isBuffer(args[0])
    ) {
      const obj = args[0];
      for (const [field, value] of Object.entries(obj)) {
        fieldValues[field] = String(value);
      }
    } else {
      for (let i = 0; i < args.length; i += 2) {
        if (i + 1 < args.length) {
          fieldValues[String(args[i])] = String(args[i + 1]);
        }
      }
    }

    return fieldValues;
  }

  /**
   * Parses ZSET command arguments for options.
   * @param args - Command arguments including WITHSCORES, LIMIT, etc.
   * @returns Parsed options object
   */
  static parseZSetArgs(args: string[]): {
    withScores: boolean;
    limit?: { offset: number; count: number };
  } {
    const withScores = args.some(arg => arg.toUpperCase() === 'WITHSCORES');
    let limit: { offset: number; count: number } | undefined = undefined;

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg && arg.toUpperCase() === 'LIMIT' && i + 2 < args.length) {
        const offsetArg = args[i + 1];
        const countArg = args[i + 2];
        if (offsetArg !== undefined && countArg !== undefined) {
          limit = {
            offset: parseInt(offsetArg.toString()),
            count: parseInt(countArg.toString()),
          };
          break;
        }
      }
    }

    const result: {
      withScores: boolean;
      limit?: { offset: number; count: number };
    } = { withScores };

    if (limit !== undefined) {
      result.limit = limit;
    }

    return result;
  }
}
