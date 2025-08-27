/**
 * Copyright Valkey GLIDE Project Contributors - SPDX Identifier: Apache-2.0
 */

import { SortedSetDataType, GlideString } from '@valkey/valkey-glide';
import { ParameterTranslator } from './ParameterTranslator';

/**
 * Utility class for translating GLIDE result formats to ioredis-compatible formats.
 * 
 * GLIDE often returns structured objects while ioredis expects flat arrays or specific formats.
 * This class centralizes all result translation logic for consistency and maintainability.
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
    
    const flatArray: string[] = [];
    for (const item of glideResult) {
      flatArray.push(
        ParameterTranslator.convertGlideString(item.element) || '',
        item.score.toString()
      );
    }
    
    return flatArray;
  }
  
  /**
   * Converts GLIDE stream entries to ioredis format.
   * 
   * @param glideResult - GLIDE stream entries
   * @returns ioredis-compatible stream format
   */
  static formatStreamEntries(glideResult: any[]): any[] {
    if (!Array.isArray(glideResult)) {
      return [];
    }
    
    // TODO: Implement stream entry translation based on GLIDE stream format
    // This will be implemented when migrating stream commands
    return glideResult.map(entry => {
      // Convert GLIDE stream entry to ioredis format
      return entry; // Placeholder
    });
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
  static formatBlockingPopResult(glideResult: [GlideString, GlideString, number] | null): [string, string, string] | null {
    if (!glideResult || !Array.isArray(glideResult) || glideResult.length !== 3) {
      return null;
    }
    
    return [
      ParameterTranslator.convertGlideString(glideResult[0]) || '',
      ParameterTranslator.convertGlideString(glideResult[1]) || '',
      glideResult[2].toString() // Convert score number to string for ioredis compatibility
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
    
    return glideResult.map(item => ParameterTranslator.convertGlideString(item) || '');
  }
  
  /**
   * Handles GLIDE's WITHSCORES result format for range operations.
   * 
   * When WITHSCORES is used, GLIDE returns SortedSetDataType (objects)
   * When WITHSCORES is not used, GLIDE returns string array
   * 
   * @param glideResult - Either SortedSetDataType or string array
   * @param withScores - Whether WITHSCORES was requested
   * @returns Appropriate ioredis format
   */
  static formatRangeResult(glideResult: SortedSetDataType | GlideString[], withScores: boolean): string[] {
    if (!Array.isArray(glideResult)) {
      return [];
    }
    
    if (withScores) {
      // GLIDE returned SortedSetDataType, flatten to ioredis format
      return this.flattenSortedSetData(glideResult as SortedSetDataType);
    } else {
      // GLIDE returned string array, convert to strings
      return this.convertStringArray(glideResult as GlideString[]);
    }
  }
  
  /**
   * Converts GLIDE error to ioredis-compatible error format.
   * 
   * @param glideError - GLIDE error object
   * @returns ioredis-compatible error
   */
  static translateError(glideError: any): Error {
    // Preserve error message and type for ioredis compatibility
    if (glideError instanceof Error) {
      return glideError;
    }
    
    return new Error(glideError?.message || 'Unknown GLIDE error');
  }
}
