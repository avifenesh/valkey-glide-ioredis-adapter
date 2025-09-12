/**
 * Error Classification Utility
 * 
 * Provides utilities for classifying and handling different types of errors
 * that can occur during GLIDE operations, improving error handling and debugging.
 */

export enum ErrorType {
  CONNECTION_ERROR = 'CONNECTION_ERROR',
  CLOSING_ERROR = 'CLOSING_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  COMMAND_ERROR = 'COMMAND_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export interface ClassifiedError {
  type: ErrorType;
  originalError: Error;
  isRetryable: boolean;
  shouldSuppress: boolean;
  message: string;
}

export class ErrorClassifier {
  /**
   * Classify an error and determine how it should be handled
   */
  static classify(error: any): ClassifiedError {
    const errorName = error?.constructor?.name || error?.name || '';
    const errorMessage = error?.message || '';
    
    // Check for ClosingError
    if (
      errorName === 'ClosingError' ||
      errorMessage.includes('ClosingError') ||
      errorMessage.includes('Client is closed')
    ) {
      return {
        type: ErrorType.CLOSING_ERROR,
        originalError: error,
        isRetryable: false,
        shouldSuppress: true, // These errors can be suppressed during cleanup
        message: 'Client is closing or already closed'
      };
    }
    
    // Check for connection errors
    if (
      errorMessage.includes('ECONNREFUSED') ||
      errorMessage.includes('ENOTFOUND') ||
      errorMessage.includes('EHOSTUNREACH') ||
      errorMessage.includes('Connection refused')
    ) {
      return {
        type: ErrorType.CONNECTION_ERROR,
        originalError: error,
        isRetryable: true,
        shouldSuppress: false,
        message: 'Failed to connect to server'
      };
    }
    
    // Check for timeout errors
    if (
      errorName === 'TimeoutError' ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('ETIMEDOUT')
    ) {
      return {
        type: ErrorType.TIMEOUT_ERROR,
        originalError: error,
        isRetryable: true,
        shouldSuppress: false,
        message: 'Operation timed out'
      };
    }
    
    // Check for authentication errors
    if (
      errorMessage.includes('NOAUTH') ||
      errorMessage.includes('Authentication') ||
      errorMessage.includes('password')
    ) {
      return {
        type: ErrorType.AUTHENTICATION_ERROR,
        originalError: error,
        isRetryable: false,
        shouldSuppress: false,
        message: 'Authentication failed'
      };
    }
    
    // Check for command errors
    if (
      errorMessage.includes('ERR') ||
      errorMessage.includes('WRONGTYPE') ||
      errorMessage.includes('wrong number of arguments')
    ) {
      return {
        type: ErrorType.COMMAND_ERROR,
        originalError: error,
        isRetryable: false,
        shouldSuppress: false,
        message: 'Command execution failed'
      };
    }
    
    // Check for network errors
    if (
      errorMessage.includes('EPIPE') ||
      errorMessage.includes('ECONNRESET') ||
      errorMessage.includes('socket')
    ) {
      return {
        type: ErrorType.NETWORK_ERROR,
        originalError: error,
        isRetryable: true,
        shouldSuppress: false,
        message: 'Network error occurred'
      };
    }
    
    // Default to unknown error
    return {
      type: ErrorType.UNKNOWN_ERROR,
      originalError: error,
      isRetryable: false,
      shouldSuppress: false,
      message: error?.message || 'Unknown error occurred'
    };
  }
  
  /**
   * Check if an error should be suppressed (e.g., during cleanup)
   */
  static shouldSuppress(error: any): boolean {
    const classified = this.classify(error);
    return classified.shouldSuppress;
  }
  
  /**
   * Check if an error is retryable
   */
  static isRetryable(error: any): boolean {
    const classified = this.classify(error);
    return classified.isRetryable;
  }
  
  /**
   * Format error for logging
   */
  static format(error: any): string {
    const classified = this.classify(error);
    return `[${classified.type}] ${classified.message} - ${classified.originalError?.stack || classified.originalError}`;
  }
}