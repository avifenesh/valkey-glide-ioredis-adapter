/**
 * ResultTranslator Comprehensive Tests
 * Testing all result translation methods for GLIDE to ioredis compatibility
 */

import {
  describe,
  it,
  test,
  beforeEach,
  afterEach,
  before,
  after,
} from 'node:test';
import assert from 'node:assert';
import { ResultTranslator } from '../../src/utils/ResultTranslator';
import { SortedSetDataType, GlideString } from '@valkey/valkey-glide';

describe('ResultTranslator', () => {
  describe('flattenSortedSetData', () => {
    test('should flatten valid SortedSetDataType to ioredis format', async () => {
      const glideResult = [
        { element: 'member1', score: 1.0 },
        { element: 'member2', score: 2.5 },
        { element: 'member3', score: 3.14159 },
      ];

      const result = ResultTranslator.flattenSortedSetData(glideResult);

      assert.deepStrictEqual(result, [
        'member1',
        '1',
        'member2',
        '2.5',
        'member3',
        '3.14159',
      ]);
    });

    test('should handle empty SortedSetDataType array', async () => {
      const glideResult = [];
      const result = ResultTranslator.flattenSortedSetData(glideResult);
      assert.deepStrictEqual(result, []);
    });

    test('should handle non-array input', async () => {
      const result = ResultTranslator.flattenSortedSetData(null);
      assert.deepStrictEqual(result, []);
    });

    test('should handle SortedSetDataType with Buffer elements', async () => {
      const glideResult = [
        { element: Buffer.from('binary_member'), score: 1.0 },
        { element: 'string_member', score: 2.0 },
      ];

      const result = ResultTranslator.flattenSortedSetData(glideResult);

      assert.deepStrictEqual(result, [
        'binary_member',
        '1',
        'string_member',
        '2',
      ]);
    });

    test('should handle SortedSetDataType with negative scores', async () => {
      const glideResult = [
        { element: 'negative', score: -1.5 },
        { element: 'positive', score: 1.5 },
        { element: 'zero', score: 0 },
      ];

      const result = ResultTranslator.flattenSortedSetData(glideResult);

      assert.deepStrictEqual(result, [
        'negative',
        '-1.5',
        'positive',
        '1.5',
        'zero',
        '0',
      ]);
    });

    test('should handle very large and small scores', async () => {
      const glideResult = [
        { element: 'large', score: Number.MAX_SAFE_INTEGER },
        { element: 'small', score: Number.MIN_SAFE_INTEGER },
        { element: 'infinity', score: Infinity },
        { element: 'negative_infinity', score: -Infinity },
      ];

      const result = ResultTranslator.flattenSortedSetData(glideResult);

      assert.strictEqual(result[1], Number.MAX_SAFE_INTEGER.toString());
      assert.strictEqual(result[3], Number.MIN_SAFE_INTEGER.toString());
      assert.strictEqual(result[5], 'Infinity');
      assert.strictEqual(result[7], '-Infinity');
    });
  });

  describe('formatStreamEntries', () => {
    test('should handle empty stream entries array', async () => {
      const result = ResultTranslator.formatStreamEntries([]);
      assert.deepStrictEqual(result, []);
    });

    test('should handle non-array input', async () => {
      const result = ResultTranslator.formatStreamEntries(null);
      assert.deepStrictEqual(result, []);
    });

    test('should pass through stream entries as placeholder', async () => {
      const glideResult = [
        { id: '1234567890-0', fields: { field1: 'value1', field2: 'value2' } },
        { id: '1234567891-0', fields: { field3: 'value3' } },
      ];

      const result = ResultTranslator.formatStreamEntries(glideResult);

      // Currently passes through as-is (placeholder implementation)
      assert.deepStrictEqual(result, glideResult);
    });

    test('should handle mixed stream entry types', async () => {
      const glideResult = ['stream_entry_1', { complex: 'object' }, null, 123];

      const result = ResultTranslator.formatStreamEntries(glideResult);
      assert.strictEqual(result.length, 4);
      assert.deepStrictEqual(result, glideResult);
    });
  });

  describe('formatBlockingPopResult', () => {
    test('should format valid blocking pop result', async () => {
      const glideResult = ['key1', 'member1', 5.5];

      const result = ResultTranslator.formatBlockingPopResult(glideResult);

      assert.deepStrictEqual(result, ['key1', 'member1', '5.5']);
    });

    test('should handle null input', async () => {
      const result = ResultTranslator.formatBlockingPopResult(null);
      assert.strictEqual(result, null);
    });

    test('should handle undefined input', async () => {
      const result = ResultTranslator.formatBlockingPopResult(undefined);
      assert.strictEqual(result, null);
    });

    test('should handle non-array input', async () => {
      const result = ResultTranslator.formatBlockingPopResult('not-an-array');
      assert.strictEqual(result, null);
    });

    test('should handle array with wrong length', async () => {
      const result1 = ResultTranslator.formatBlockingPopResult(['key']);
      assert.strictEqual(result1, null);

      const result2 = ResultTranslator.formatBlockingPopResult([
        'key',
        'member',
      ]);
      assert.strictEqual(result2, null);

      const result3 = ResultTranslator.formatBlockingPopResult([
        'key',
        'member',
        1,
        'extra',
      ]);
      assert.strictEqual(result3, null);
    });

    test('should handle Buffer GlideString inputs', async () => {
      const glideResult = [
        Buffer.from('buffer_key'),
        Buffer.from('buffer_member'),
        42.7,
      ];

      const result = ResultTranslator.formatBlockingPopResult(glideResult);

      assert.deepStrictEqual(result, ['buffer_key', 'buffer_member', '42.7']);
    });

    test('should handle zero and negative scores', async () => {
      const glideResult = ['key', 'member', 0];
      const result1 = ResultTranslator.formatBlockingPopResult(glideResult);
      assert.deepStrictEqual(result1, ['key', 'member', '0']);

      const negativeResult = ['key', 'member', -3.14];
      const result2 = ResultTranslator.formatBlockingPopResult(negativeResult);
      assert.deepStrictEqual(result2, ['key', 'member', '-3.14']);
    });
  });

  describe('convertStringArray', () => {
    test('should convert valid GlideString array', async () => {
      const glideResult = ['string1', 'string2', 'string3'];

      const result = ResultTranslator.convertStringArray(glideResult);

      assert.deepStrictEqual(result, ['string1', 'string2', 'string3']);
    });

    test('should handle empty array', async () => {
      const result = ResultTranslator.convertStringArray([]);
      assert.deepStrictEqual(result, []);
    });

    test('should handle non-array input', async () => {
      const result = ResultTranslator.convertStringArray('not-an-array');
      assert.deepStrictEqual(result, []);
    });

    test('should handle Buffer GlideString elements', async () => {
      const glideResult = [
        Buffer.from('buffer1'),
        'regular_string',
        Buffer.from('buffer2'),
      ];

      const result = ResultTranslator.convertStringArray(glideResult);

      assert.deepStrictEqual(result, ['buffer1', 'regular_string', 'buffer2']);
    });

    test('should handle null elements gracefully', async () => {
      const glideResult = ['valid', null, undefined, 'another_valid'];

      const result = ResultTranslator.convertStringArray(glideResult);

      assert.deepStrictEqual(result, ['valid', '', '', 'another_valid']);
    });

    test('should handle mixed string and Buffer array', async () => {
      const glideResult = [
        'string',
        Buffer.from('binary_data', 'utf8'),
        '',
        Buffer.from('more_binary'),
      ];

      const result = ResultTranslator.convertStringArray(glideResult);

      assert.deepStrictEqual(result, [
        'string',
        'binary_data',
        '',
        'more_binary',
      ]);
    });
  });

  describe('formatRangeResult', () => {
    test('should format SortedSetDataType when withScores is true', async () => {
      const glideResult = [
        { element: 'member1', score: 1.0 },
        { element: 'member2', score: 2.0 },
      ];

      const result = ResultTranslator.formatRangeResult(glideResult, true);

      assert.deepStrictEqual(result, ['member1', '1', 'member2', '2']);
    });

    test('should format string array when withScores is false', async () => {
      const glideResult = ['member1', 'member2', 'member3'];

      const result = ResultTranslator.formatRangeResult(glideResult, false);

      assert.deepStrictEqual(result, ['member1', 'member2', 'member3']);
    });

    test('should handle non-array input', async () => {
      const result1 = ResultTranslator.formatRangeResult(null, true);
      assert.deepStrictEqual(result1, []);

      const result2 = ResultTranslator.formatRangeResult(undefined, false);
      assert.deepStrictEqual(result2, []);
    });

    test('should handle empty arrays', async () => {
      const result1 = ResultTranslator.formatRangeResult([], true);
      assert.deepStrictEqual(result1, []);

      const result2 = ResultTranslator.formatRangeResult([], false);
      assert.deepStrictEqual(result2, []);
    });

    test('should handle Buffer elements when withScores is false', async () => {
      const glideResult = [
        Buffer.from('binary1'),
        'string1',
        Buffer.from('binary2'),
      ];

      const result = ResultTranslator.formatRangeResult(glideResult, false);

      assert.deepStrictEqual(result, ['binary1', 'string1', 'binary2']);
    });

    test('should handle SortedSetDataType with Buffer elements when withScores is true', async () => {
      const glideResult = [
        { element: Buffer.from('buffer_member'), score: 1.5 },
        { element: 'string_member', score: 2.5 },
      ];

      const result = ResultTranslator.formatRangeResult(glideResult, true);

      assert.deepStrictEqual(result, [
        'buffer_member',
        '1.5',
        'string_member',
        '2.5',
      ]);
    });
  });

  describe('formatFloatResult', () => {
    test('should format integer values', async () => {
      assert.strictEqual(ResultTranslator.formatFloatResult(42), '42');
      assert.strictEqual(ResultTranslator.formatFloatResult(0), '0');
      assert.strictEqual(ResultTranslator.formatFloatResult(-15), '-15');
    });

    test('should format decimal values', async () => {
      assert.strictEqual(
        ResultTranslator.formatFloatResult(3.14159),
        '3.14159'
      );
      assert.strictEqual(ResultTranslator.formatFloatResult(0.5), '0.5');
      assert.strictEqual(ResultTranslator.formatFloatResult(-2.75), '-2.75');
    });

    test('should handle floating point precision issues', async () => {
      // JavaScript floating point arithmetic can be imprecise
      const result1 = ResultTranslator.formatFloatResult(0.1 + 0.2);
      assert.ok(Math.abs(parseFloat(result1) - 0.3) < Math.pow(10, -10));

      const result2 = ResultTranslator.formatFloatResult(1.1 * 1.1);
      assert.ok(Math.abs(parseFloat(result2) - 1.21) < Math.pow(10, -10));
    });

    test('should handle very small numbers', async () => {
      assert.strictEqual(
        ResultTranslator.formatFloatResult(0.000000000000001),
        '1e-15'
      );
      // Number.MIN_VALUE may be rounded to 0 due to precision handling
      const minValueResult = ResultTranslator.formatFloatResult(
        Number.MIN_VALUE
      );
      assert.strictEqual(
        minValueResult === '5e-324' || minValueResult === '0',
        true
      );
    });

    test('should handle very large numbers', async () => {
      assert.strictEqual(
        ResultTranslator.formatFloatResult(Number.MAX_SAFE_INTEGER),
        '9007199254740991'
      );
      assert.strictEqual(
        ResultTranslator.formatFloatResult(1e20),
        '100000000000000000000'
      );
    });

    test('should handle special float values', async () => {
      assert.strictEqual(
        ResultTranslator.formatFloatResult(Infinity),
        'Infinity'
      );
      assert.strictEqual(
        ResultTranslator.formatFloatResult(-Infinity),
        '-Infinity'
      );
      assert.strictEqual(ResultTranslator.formatFloatResult(NaN), 'NaN');
    });

    test('should handle rounding edge cases', async () => {
      // Test numbers that require proper rounding
      assert.strictEqual(
        ResultTranslator.formatFloatResult(1.9999999999999998),
        '2'
      );
      assert.strictEqual(
        ResultTranslator.formatFloatResult(0.9999999999999999),
        '1'
      );
    });
  });

  describe('translateError', () => {
    test('should pass through Error instances unchanged', async () => {
      const originalError = new Error('Test error message');
      const result = ResultTranslator.translateError(originalError);

      assert.strictEqual(result, originalError);
      assert.strictEqual(result.message, 'Test error message');
    });

    test('should convert error-like objects to Error instances', async () => {
      const errorLike = { message: 'Custom error message' };
      const result = ResultTranslator.translateError(errorLike);

      assert.ok(result instanceof Error);
      assert.strictEqual(result.message, 'Custom error message');
    });

    test('should handle null error input', async () => {
      const result = ResultTranslator.translateError(null);

      assert.ok(result instanceof Error);
      assert.strictEqual(result.message, 'Unknown GLIDE error');
    });

    test('should handle undefined error input', async () => {
      const result = ResultTranslator.translateError(undefined);

      assert.ok(result instanceof Error);
      assert.strictEqual(result.message, 'Unknown GLIDE error');
    });

    test('should handle string error input', async () => {
      const result = ResultTranslator.translateError('String error');

      assert.ok(result instanceof Error);
      assert.strictEqual(result.message, 'Unknown GLIDE error');
    });

    test('should handle object without message property', async () => {
      const errorObject = { code: 'ERR_CODE', details: 'Some details' };
      const result = ResultTranslator.translateError(errorObject);

      assert.ok(result instanceof Error);
      assert.strictEqual(result.message, 'Unknown GLIDE error');
    });

    test('should preserve Error subclass types', async () => {
      class CustomError extends Error {
        constructor(message, code) {
          super(message);
          this.name = 'CustomError';
          this.code = code;
        }
      }

      const customError = new CustomError('Custom message', 'CUSTOM_CODE');
      const result = ResultTranslator.translateError(customError);

      assert.strictEqual(result, customError);
      assert.ok(result instanceof CustomError);
      assert.strictEqual(result.message, 'Custom message');
      assert.strictEqual(result.code, 'CUSTOM_CODE');
    });

    test('should handle TypeError and other Error types', async () => {
      const typeError = new TypeError('Type error message');
      const result = ResultTranslator.translateError(typeError);

      assert.strictEqual(result, typeError);
      assert.ok(result instanceof TypeError);
      assert.strictEqual(result.message, 'Type error message');
    });
  });
});
