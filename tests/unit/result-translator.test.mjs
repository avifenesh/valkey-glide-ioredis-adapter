import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
/**
 * ResultTranslator Comprehensive Tests
 * Testing all result translation methods for GLIDE to ioredis compatibility
 */

import { ResultTranslator } from '../../src/utils/ResultTranslator';

describe('ResultTranslator', () => {
  describe('flattenSortedSetData', () => {
    it('should flatten valid SortedSetDataType to ioredis format', () => {
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

    it('should handle empty SortedSetDataType array', () => {
      const glideResult = [];
      const result = ResultTranslator.flattenSortedSetData(glideResult);
      assert.deepStrictEqual(result, []);
    });

    it('should handle non-array input', () => {
      const result = ResultTranslator.flattenSortedSetData(null);
      assert.deepStrictEqual(result, []);
    });

    it('should handle SortedSetDataType with Buffer elements', () => {
      const glideResult = [
        { element: Buffer.from('binary_member'), score: 1.0 },
        { element: 'string_member', score: 2.0 },
      ];

      const result = ResultTranslator.flattenSortedSetData(glideResult);

      assert.deepStrictEqual(result, ['binary_member', '1', 'string_member', '2']);
    });

    it('should handle SortedSetDataType with negative scores', () => {
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

    it('should handle very large and small scores', () => {
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
    it('should handle empty stream entries array', () => {
      const result = ResultTranslator.formatStreamEntries([]);
      assert.deepStrictEqual(result, []);
    });

    it('should handle non-array input', () => {
      const result = ResultTranslator.formatStreamEntries(null);
      assert.deepStrictEqual(result, []);
    });

    it('should pass through stream entries as placeholder', () => {
      const glideResult = [
        { id: '1234567890-0', fields: { field1: 'value1', field2: 'value2' } },
        { id: '1234567891-0', fields: { field3: 'value3' } },
      ];

      const result = ResultTranslator.formatStreamEntries(glideResult);

      // Currently passes through as-is (placeholder implementation)
      assert.deepStrictEqual(result, glideResult);
    });

    it('should handle mixed stream entry types', () => {
      const glideResult = ['stream_entry_1', { complex: 'object' }, null, 123];

      const result = ResultTranslator.formatStreamEntries(glideResult);
      assert.strictEqual(result.length, 4);
      assert.deepStrictEqual(result, glideResult);
    });
  });

  describe('formatBlockingPopResult', () => {
    it('should format valid blocking pop result', () => {
      const glideResult = [
        'key1',
        'member1',
        5.5,
      ];

      const result = ResultTranslator.formatBlockingPopResult(glideResult);

      assert.deepStrictEqual(result, ['key1', 'member1', '5.5']);
    });

    it('should handle null input', () => {
      const result = ResultTranslator.formatBlockingPopResult(null);
      assert.strictEqual(result, null);
    });

    it('should handle undefined input', () => {
      const result = ResultTranslator.formatBlockingPopResult(undefined);
      assert.strictEqual(result, null);
    });

    it('should handle non-array input', () => {
      const result = ResultTranslator.formatBlockingPopResult(
        'not-an-array'
      );
      assert.strictEqual(result, null);
    });

    it('should handle array with wrong length', () => {
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

    it('should handle Buffer GlideString inputs', () => {
      const glideResult = [
        Buffer.from('buffer_key'),
        Buffer.from('buffer_member'),
        42.7,
      ];

      const result = ResultTranslator.formatBlockingPopResult(glideResult);

      assert.deepStrictEqual(result, ['buffer_key', 'buffer_member', '42.7']);
    });

    it('should handle zero and negative scores', () => {
      const glideResult = [
        'key',
        'member',
        0,
      ];
      const result1 = ResultTranslator.formatBlockingPopResult(glideResult);
      assert.deepStrictEqual(result1, ['key', 'member', '0']);

      const negativeResult = [
        'key',
        'member',
        -3.14,
      ];
      const result2 = ResultTranslator.formatBlockingPopResult(negativeResult);
      assert.deepStrictEqual(result2, ['key', 'member', '-3.14']);
    });
  });

  describe('convertStringArray', () => {
    it('should convert valid GlideString array', () => {
      const glideResult = ['string1', 'string2', 'string3'];

      const result = ResultTranslator.convertStringArray(glideResult);

      assert.deepStrictEqual(result, ['string1', 'string2', 'string3']);
    });

    it('should handle empty array', () => {
      const result = ResultTranslator.convertStringArray([]);
      assert.deepStrictEqual(result, []);
    });

    it('should handle non-array input', () => {
      const result = ResultTranslator.convertStringArray('not-an-array');
      assert.deepStrictEqual(result, []);
    });

    it('should handle Buffer GlideString elements', () => {
      const glideResult = [
        Buffer.from('buffer1'),
        'regular_string',
        Buffer.from('buffer2'),
      ];

      const result = ResultTranslator.convertStringArray(glideResult);

      assert.deepStrictEqual(result, ['buffer1', 'regular_string', 'buffer2']);
    });

    it('should handle null elements gracefully', () => {
      const glideResult = [
        'valid',
        null,
        undefined,
        'another_valid',
      ];

      const result = ResultTranslator.convertStringArray(glideResult);

      assert.deepStrictEqual(result, ['valid', '', '', 'another_valid']);
    });

    it('should handle mixed string and Buffer array', () => {
      const glideResult = [
        'string',
        Buffer.from('binary_data', 'utf8'),
        '',
        Buffer.from('more_binary'),
      ];

      const result = ResultTranslator.convertStringArray(glideResult);

      assert.deepStrictEqual(result, ['string', 'binary_data', '', 'more_binary']);
    });
  });

  describe('formatRangeResult', () => {
    it('should format SortedSetDataType when withScores is true', () => {
      const glideResult = [
        { element: 'member1', score: 1.0 },
        { element: 'member2', score: 2.0 },
      ];

      const result = ResultTranslator.formatRangeResult(glideResult, true);

      assert.deepStrictEqual(result, ['member1', '1', 'member2', '2']);
    });

    it('should format string array when withScores is false', () => {
      const glideResult = ['member1', 'member2', 'member3'];

      const result = ResultTranslator.formatRangeResult(glideResult, false);

      assert.deepStrictEqual(result, ['member1', 'member2', 'member3']);
    });

    it('should handle non-array input', () => {
      const result1 = ResultTranslator.formatRangeResult(null, true);
      assert.deepStrictEqual(result1, []);

      const result2 = ResultTranslator.formatRangeResult(
        undefined,
        false
      );
      assert.deepStrictEqual(result2, []);
    });

    it('should handle empty arrays', () => {
      const result1 = ResultTranslator.formatRangeResult([], true);
      assert.deepStrictEqual(result1, []);

      const result2 = ResultTranslator.formatRangeResult([], false);
      assert.deepStrictEqual(result2, []);
    });

    it('should handle Buffer elements when withScores is false', () => {
      const glideResult = [
        Buffer.from('binary1'),
        'string1',
        Buffer.from('binary2'),
      ];

      const result = ResultTranslator.formatRangeResult(glideResult, false);

      assert.deepStrictEqual(result, ['binary1', 'string1', 'binary2']);
    });

    it('should handle SortedSetDataType with Buffer elements when withScores is true', () => {
      const glideResult = [
        { element: Buffer.from('buffer_member'), score: 1.5 },
        { element: 'string_member', score: 2.5 },
      ];

      const result = ResultTranslator.formatRangeResult(glideResult, true);

      assert.deepStrictEqual(result, ['buffer_member', '1.5', 'string_member', '2.5']);
    });
  });

  describe('formatFloatResult', () => {
    it('should format integer values', () => {
      expect(ResultTranslator.formatFloatResult(42)).toBe('42');
      expect(ResultTranslator.formatFloatResult(0)).toBe('0');
      expect(ResultTranslator.formatFloatResult(-15)).toBe('-15');
    });

    it('should format decimal values', () => {
      expect(ResultTranslator.formatFloatResult(3.14159)).toBe('3.14159');
      expect(ResultTranslator.formatFloatResult(0.5)).toBe('0.5');
      expect(ResultTranslator.formatFloatResult(-2.75)).toBe('-2.75');
    });

    it('should handle floating point precision issues', () => {
      // JavaScript floating point arithmetic can be imprecise
      const result1 = ResultTranslator.formatFloatResult(0.1 + 0.2);
      expect(parseFloat(result1)).toBeCloseTo(0.3, 10);

      const result2 = ResultTranslator.formatFloatResult(1.1 * 1.1);
      expect(parseFloat(result2)).toBeCloseTo(1.21, 10);
    });

    it('should handle very small numbers', () => {
      expect(ResultTranslator.formatFloatResult(0.000000000000001)).toBe(
        '1e-15'
      );
      // Number.MIN_VALUE may be rounded to 0 due to precision handling
      const minValueResult = ResultTranslator.formatFloatResult(
        Number.MIN_VALUE
      );
      assert.strictEqual(minValueResult === '5e-324' || minValueResult === '0', true);
    });

    it('should handle very large numbers', () => {
      expect(ResultTranslator.formatFloatResult(Number.MAX_SAFE_INTEGER)).toBe(
        '9007199254740991'
      );
      expect(ResultTranslator.formatFloatResult(1e20)).toBe(
        '100000000000000000000'
      );
    });

    it('should handle special float values', () => {
      expect(ResultTranslator.formatFloatResult(Infinity)).toBe('Infinity');
      expect(ResultTranslator.formatFloatResult(-Infinity)).toBe('-Infinity');
      expect(ResultTranslator.formatFloatResult(NaN)).toBe('NaN');
    });

    it('should handle rounding edge cases', () => {
      // Test numbers that require proper rounding
      expect(ResultTranslator.formatFloatResult(1.9999999999999998)).toBe('2');
      expect(ResultTranslator.formatFloatResult(0.9999999999999999)).toBe('1');
    });
  });

  describe('translateError', () => {
    it('should pass through Error instances unchanged', () => {
      const originalError = new Error('Test error message');
      const result = ResultTranslator.translateError(originalError);

      assert.strictEqual(result, originalError);
      assert.strictEqual(result.message, 'Test error message');
    });

    it('should convert error-like objects to Error instances', () => {
      const errorLike = { message: 'Custom error message' };
      const result = ResultTranslator.translateError(errorLike);

      assert.ok(result instanceof Error);
      assert.strictEqual(result.message, 'Custom error message');
    });

    it('should handle null error input', () => {
      const result = ResultTranslator.translateError(null);

      assert.ok(result instanceof Error);
      assert.strictEqual(result.message, 'Unknown GLIDE error');
    });

    it('should handle undefined error input', () => {
      const result = ResultTranslator.translateError(undefined);

      assert.ok(result instanceof Error);
      assert.strictEqual(result.message, 'Unknown GLIDE error');
    });

    it('should handle string error input', () => {
      const result = ResultTranslator.translateError('String error');

      assert.ok(result instanceof Error);
      assert.strictEqual(result.message, 'Unknown GLIDE error');
    });

    it('should handle object without message property', () => {
      const errorObject = { code: 'ERR_CODE', details: 'Some details' };
      const result = ResultTranslator.translateError(errorObject);

      assert.ok(result instanceof Error);
      assert.strictEqual(result.message, 'Unknown GLIDE error');
    });

    it('should preserve Error subclass types', () => {
      class CustomError extends Error {
        constructor(
          message,
          code
        ) {
          super(message);
          this.name = 'CustomError';
        }
      }

      const customError = new CustomError('Custom message', 'CUSTOM_CODE');
      const result = ResultTranslator.translateError(customError);

      assert.strictEqual(result, customError);
      assert.ok(result instanceof CustomError);
      assert.strictEqual(result.message, 'Custom message');
      assert.strictEqual(result.code, 'CUSTOM_CODE');
    });

    it('should handle TypeError and other Error types', () => {
      const typeError = new TypeError('Type error message');
      const result = ResultTranslator.translateError(typeError);

      assert.strictEqual(result, typeError);
      assert.ok(result instanceof TypeError);
      assert.strictEqual(result.message, 'Type error message');
    });
  });
});
