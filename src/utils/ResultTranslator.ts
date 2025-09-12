/**
 * Copyright Valkey GLIDE Project Contributors - SPDX Identifier: Apache-2.0
 */

import { SortedSetDataType, GlideString } from '@valkey/valkey-glide';
import { ParameterTranslator } from './ParameterTranslator';

/**
 * Result Translation Utilities
 *
 * Converts Valkey GLIDE result formats to ioredis-compatible formats.
 * GLIDE returns structured objects while ioredis expects flat arrays or
 * specific string formats.
 */
export class ResultTranslator {
  /**
   * Converts GLIDE's SortedSetDataType to ioredis flat array format.
   *
   * GLIDE returns: [{element: 'member1', score: 1.0}, {element: 'member2', score: 2.0}]
   * ioredis expects: ['member1', '1', 'member2', '2']
   *
   * @param glideResult - GLIDE SortedSetDataType array
   * @returns Flat array of alternating members and scores as strings
   */
  static flattenSortedSetData(glideResult: SortedSetDataType): string[] {
    if (!Array.isArray(glideResult)) {
      return [];
    }

    // Performance optimization: Pre-allocate array with known size
    const flatArray = new Array(glideResult.length * 2);
    let index = 0;

    for (const item of glideResult) {
      // Bounds checking: ensure item has required properties
      if (!item || typeof item !== 'object') {
        continue; // Skip invalid items
      }

      // Direct array assignment is faster than push
      flatArray[index++] =
        ParameterTranslator.convertGlideString(item.element) || '';
      flatArray[index++] = (item.score ?? 0).toString();
    }

    return flatArray;
  }

  /**
   * Converts GLIDE stream entries to ioredis format.
   * @param glideResult - GLIDE stream entries
   * @returns ioredis-compatible stream format
   */
  static formatStreamEntries(glideResult: any[]): any[] {
    if (!Array.isArray(glideResult)) {
      return [];
    }
    return glideResult;
  }

  /**
   * Converts GLIDE blocking pop result to ioredis format.
   *
   * GLIDE returns: [key, member, score] where score is number
   * ioredis expects: [key, member, score] where score is string
   *
   * @param glideResult - GLIDE blocking pop result
   * @returns ioredis-compatible result with score as string
   */
  static formatBlockingPopResult(
    glideResult: [GlideString, GlideString, number] | null
  ): [string, string, string] | null {
    if (
      !glideResult ||
      !Array.isArray(glideResult) ||
      glideResult.length !== 3
    ) {
      return null;
    }

    return [
      ParameterTranslator.convertGlideString(glideResult[0]) || '',
      ParameterTranslator.convertGlideString(glideResult[1]) || '',
      glideResult[2].toString(), // Convert score number to string for ioredis compatibility
    ];
  }

  /**
   * Converts GLIDE string array to ioredis string array.
   *
   * @param glideResult - GLIDE string array (may contain GlideString types)
   * @returns Array of strings
   */
  static convertStringArray(glideResult: GlideString[]): string[] {
    if (!Array.isArray(glideResult)) {
      return [];
    }

    // Performance optimization: Pre-allocate array
    const result = new Array(glideResult.length);
    for (let i = 0; i < glideResult.length; i++) {
      result[i] = ParameterTranslator.convertGlideString(glideResult[i]) || '';
    }
    return result;
  }

  /**
   * Handles GLIDE's WITHSCORES result format for range operations.
   * @param glideResult - Either SortedSetDataType or string array
   * @param withScores - Whether WITHSCORES was requested
   * @returns Appropriate ioredis format
   */
  static formatRangeResult(
    glideResult: SortedSetDataType | GlideString[],
    withScores: boolean
  ): string[] {
    if (!Array.isArray(glideResult)) {
      return [];
    }

    // Performance optimization: Type check once
    if (withScores) {
      // Fast path for WITHSCORES
      return this.flattenSortedSetData(glideResult as SortedSetDataType);
    }

    // Fast path for simple string array conversion
    return this.convertStringArray(glideResult as GlideString[]);
  }

  /**
   * Formats floating point numbers to match ioredis precision expectations.
   * @param value - Floating point number from GLIDE
   * @returns Properly formatted number string
   */
  static formatFloatResult(value: number): string {
    const rounded = Math.round(value * 1e15) / 1e15;
    return rounded.toString();
  }

  /**
   * Converts GLIDE stream result to ioredis format.
   * @param glideResult - GLIDE xreadgroup result
   * @returns ioredis-compatible stream result
   */
  static translateStreamResult(glideResult: any): any {
    return glideResult;
  }

  /**
   * Converts GLIDE error to ioredis-compatible error format.
   * @param glideError - GLIDE error object
   * @returns ioredis-compatible error
   */
  static translateError(glideError: any): Error {
    if (glideError instanceof Error) {
      return glideError;
    }
    return new Error(glideError?.message || 'Unknown GLIDE error');
  }

  /**
   * Converts JavaScript Map objects to regular objects.
   * @param mapObject - JavaScript Map or regular object
   * @returns Regular JavaScript object
   */
  static translateMapToObject(mapObject: any): Record<string, any> {
    if (mapObject instanceof Map) {
      const result: Record<string, any> = {};
      for (const [key, value] of mapObject) {
        result[key] = value;
      }
      return result;
    }

    return mapObject || {};
  }

  /**
   * Converts Valkey Search FT.SEARCH Map response to ioredis format.
   * @param searchResult - GLIDE Map result from FT.SEARCH
   * @returns ioredis-compatible search result array
   */
  static translateSearchResponse(searchResult: any): any[] {
    if (searchResult instanceof Map) {
      const result: any[] = [];

      const total = searchResult.get('total') || searchResult.size || 0;
      result.push(Number(total));

      for (const [docId, fields] of searchResult) {
        if (docId === 'total') continue;

        result.push(docId);

        const fieldArray: string[] = [];

        if (fields instanceof Map) {
          for (const [fieldName, fieldValue] of fields) {
            fieldArray.push(fieldName, String(fieldValue));
          }
        } else if (Array.isArray(fields)) {
          result.push(fields);
          continue;
        } else if (typeof fields === 'object' && fields !== null) {
          for (const [fieldName, fieldValue] of Object.entries(fields)) {
            fieldArray.push(fieldName, String(fieldValue));
          }
        }

        result.push(fieldArray.length > 0 ? fieldArray : []);
      }

      return result;
    }

    return Array.isArray(searchResult) ? searchResult : [0];
  }

  /**
   * Converts Valkey Search FT.INFO Map response to ioredis format.
   * @param infoResult - GLIDE Map result from FT.INFO
   * @returns ioredis-compatible info result array
   */
  static translateInfoResponse(infoResult: any): any[] {
    if (infoResult instanceof Map) {
      const result: any[] = [];
      for (const [key, value] of infoResult) {
        result.push(key, value);
      }
      return result;
    }

    if (Array.isArray(infoResult)) {
      return infoResult;
    }

    if (typeof infoResult === 'object' && infoResult !== null) {
      const result: any[] = [];
      for (const [key, value] of Object.entries(infoResult)) {
        result.push(key, value);
      }
      return result;
    }

    return [];
  }

  /**
   * Converts GLIDE XREAD result to ioredis format.
   * @param glideResult - GLIDE XREAD result
   * @returns ioredis-compatible format: [[streamKey, [[id1, [field1, value1]], [id2, [...]]]]]
   */
  static translateStreamReadResponse(glideResult: any): any[] | null {
    if (
      !glideResult ||
      !Array.isArray(glideResult) ||
      glideResult.length === 0
    ) {
      return [];
    }

    const ioredisStreams: [string, [string, string[]][]][] = [];

    for (const streamData of glideResult) {
      if (!streamData || !streamData.key || !streamData.value) {
        continue;
      }

      const streamKey = streamData.key;
      const entries = streamData.value;
      const ioredisEntries: [string, string[]][] = [];

      for (const [entryId, fieldValuePairs] of Object.entries(entries)) {
        const flatFields: string[] = [];
        for (const [field, value] of fieldValuePairs as [string, string][]) {
          flatFields.push(field, value);
        }
        ioredisEntries.push([entryId, flatFields]);
      }

      ioredisStreams.push([streamKey, ioredisEntries]);
    }

    return ioredisStreams;
  }

  /**
   * Converts GLIDE XRANGE result to ioredis format.
   * @param glideResult - GLIDE XRANGE result
   * @returns ioredis-compatible format: [[id1, [field1, value1]], [id2, [...]]]
   */
  static translateStreamRangeResponse(glideResult: any): [string, string[]][] {
    if (!glideResult || typeof glideResult !== 'object') {
      return [];
    }

    const ioredisEntries: [string, string[]][] = [];

    for (const [entryId, fieldValuePairs] of Object.entries(glideResult)) {
      const flatFields: string[] = [];
      for (const [field, value] of fieldValuePairs as [string, string][]) {
        flatFields.push(field, value);
      }
      ioredisEntries.push([entryId, flatFields]);
    }

    return ioredisEntries;
  }

  /**
   * Converts GLIDE hash result to plain object.
   * @param result - GLIDE hash result
   * @returns Plain JavaScript object with string values
   */
  static convertHashResult(result: any): Record<string, string> {
    const converted: Record<string, string> = {};
    if (!result || typeof result !== 'object') {
      return converted;
    }

    for (const [key, value] of Object.entries(result)) {
      converted[key] = ParameterTranslator.convertGlideString(value) || '';
    }
    return converted;
  }

  /**
   * Converts GLIDE array result to string array.
   * @param result - GLIDE array result
   * @returns Array of strings
   */
  static convertArrayResult(result: any[]): string[] {
    if (!Array.isArray(result)) {
      return [];
    }
    return result.map(
      item => ParameterTranslator.convertGlideString(item) || ''
    );
  }
}
