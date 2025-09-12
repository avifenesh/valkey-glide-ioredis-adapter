/**
 * Constants and Configuration Values
 * 
 * Centralized configuration for timeouts, limits, and other magic numbers
 * used throughout the adapter.
 */

// Connection Settings
export const CONNECTION = {
  DEFAULT_TIMEOUT_MS: 10000,
  DEFAULT_PORT: 6379,
  DEFAULT_HOST: 'localhost',
  DEFAULT_CONNECT_TIMEOUT_MS: 10000,
  DEFAULT_REQUEST_TIMEOUT_MS: 5000,
} as const;

// Buffer and Memory Limits
export const BUFFER_LIMITS = {
  MAX_BUFFER_SIZE: 16 * 1024 * 1024, // 16MB max buffer for pub/sub client
  INITIAL_BUFFER_SIZE: 0,
  MAX_PIPELINE_LENGTH: 1000,
} as const;

// Cache Settings
export const CACHE = {
  DEFAULT_LRU_SIZE: 1000,
  PARAMETER_CACHE_SIZE: 1000,
} as const;

// Retry and Backoff Settings
export const RETRY = {
  DEFAULT_MAX_RETRIES: 50,
  DEFAULT_RETRY_DELAY_MS: 100,
  MIN_JITTER_PERCENT: 5,
  MAX_JITTER_PERCENT: 100,
  OFFLINE_QUEUE_LIMIT: 100,
} as const;

// Scan Operation Settings
export const SCAN = {
  DEFAULT_COUNT: 1000,
  DEFAULT_PATTERN: '*',
} as const;

// Transaction and Pipeline Settings
export const BATCH = {
  DEFAULT_PIPELINE_EXEC_TIMEOUT_MS: 5000,
} as const;

// Pub/Sub Settings
export const PUBSUB = {
  RESP_ARRAY: '*',
  RESP_BULK_STRING: '$',
  RESP_INTEGER: ':',
  RESP_CRLF: '\r\n',
  BINARY_MARKER: '__GLIDE_BINARY__:',
} as const;

// Test Environment Settings
export const TEST_ENV = {
  DEFAULT_TEST_PORT: 6383,
  DEFAULT_TEST_HOST: 'localhost',
  CLUSTER_PORTS: [17000, 17001, 17002],
} as const;

// Instance Tracking
export const INSTANCE = {
  ID_PREFIX: 'client_',
  ID_RANDOM_LENGTH: 9,
} as const;