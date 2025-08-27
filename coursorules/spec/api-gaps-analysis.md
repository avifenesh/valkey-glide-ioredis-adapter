# API Gaps Analysis & Missing Adaptations

## Executive Summary

Based on test failures and library requirements analysis, we have identified critical API gaps in our ioredis adapter that prevent Bull, Bee-Queue, and other libraries from functioning correctly. This document details the missing adaptations needed.

## Critical API Gaps

### 1. Lua Script & Custom Command Issues

#### Current Problems
- `defineCommand()` doesn't handle both argument styles (variadic vs array)
- Return values don't match ioredis format (null instead of arrays)
- KEYS/ARGV splitting inconsistent with `numberOfKeys`

#### Missing Adaptations
```typescript
// src/adapters/RedisAdapter.ts - Enhanced defineCommand
defineCommand(name: string, options: { lua: string; numberOfKeys?: number }): void {
  const { lua, numberOfKeys = 0 } = options;
  
  (this as any)[name] = async (...args: any[]): Promise<any> => {
    const client = await this.ensureConnected();
    const numkeys = Number(numberOfKeys) || 0;
    
    // Handle both argument patterns
    let keys: any[], argv: any[];
    
    if (args.length === 1 && Array.isArray(args[0])) {
      // BullMQ style: single array argument
      const allArgs = args[0];
      keys = allArgs.slice(0, numkeys);
      argv = allArgs.slice(numkeys);
    } else {
      // ioredis style: variadic arguments
      keys = args.slice(0, numkeys);
      argv = args.slice(numkeys);
    }
    
    // Normalize arguments for Valkey GLIDE
    const normalizedKeys = keys.map(k => ParameterTranslator.normalizeKey(k));
    const normalizedArgs = argv.map(arg => {
      if (Buffer.isBuffer(arg)) return arg;
      if (arg === null || arg === undefined) return '';
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    });
    
    try {
      const scriptObj = new Script(lua);
      const result = await client.invokeScript(scriptObj, {
        keys: normalizedKeys,
        args: normalizedArgs
      });
      
      // Ensure arrays are returned instead of null
      if (result === null && lua.includes('return {}')) {
        return [];
      }
      
      return result;
    } catch (error) {
      // Fallback to EVAL if Script fails
      const commandArgs = [lua, numkeys.toString(), ...normalizedKeys, ...normalizedArgs];
      const fallbackResult = await client.customCommand(['EVAL', ...commandArgs]);
      
      return fallbackResult === null && lua.includes('return {}') ? [] : fallbackResult;
    }
  };
}
```

### 2. Client Factory Pattern (Bull Integration)

#### Current Problems
- No `createClient(type)` static method
- Bull expects immediate client return with async connection
- Missing `bclient` (blocking client) support

#### Missing Adaptations
```typescript
// src/adapters/RedisAdapter.ts - Static factory methods
static createClient(type: 'client' | 'subscriber' | 'bclient', options?: RedisOptions): RedisAdapter {
  const adapter = new RedisAdapter(options || {});
  
  // Set client type for specialized behavior
  (adapter as any).clientType = type;
  
  if (type === 'bclient') {
    // Enable blocking operations
    (adapter as any).enableBlockingOps = true;
  }
  
  // Bull expects immediate return - connect asynchronously
  setImmediate(() => {
    adapter.connect().catch(err => {
      console.error(`Failed to connect ${type} client:`, err);
      adapter.emit('error', err);
    });
  });
  
  return adapter;
}

// Enhanced duplicate method for Bull compatibility
async duplicate(override?: Partial<RedisOptions>): Promise<RedisAdapter> {
  const options = override ? { ...this._options, ...override } : this._options;
  const newAdapter = new RedisAdapter(options);
  
  // Copy client type if set
  if ((this as any).clientType) {
    (newAdapter as any).clientType = (this as any).clientType;
  }
  
  // Connect in background for Bull compatibility
  setImmediate(() => {
    newAdapter.connect().catch(err => {
      console.error('Background connection failed for duplicated client:', err);
      newAdapter.emit('error', err);
    });
  });
  
  return newAdapter;
}
```

### 3. Blocking Operations Support

#### Current Problems
- No blocking list operations (`brpoplpush`, `blpop`, `brpop`)
- Bull's `bclient` requires these for job processing

#### Missing Adaptations
```typescript
// src/adapters/RedisAdapter.ts - Blocking operations
async brpoplpush(source: RedisKey, destination: RedisKey, timeout: number): Promise<string | null> {
  const client = await this.ensureConnected();
  const normalizedSource = ParameterTranslator.normalizeKey(source);
  const normalizedDest = ParameterTranslator.normalizeKey(destination);
  
  try {
    const result = await client.customCommand([
      'BRPOPLPUSH',
      normalizedSource,
      normalizedDest,
      timeout.toString()
    ]);
    
    return result || null;
  } catch (error) {
    // Handle timeout as expected behavior
    if (timeout > 0 && (error.message.includes('timeout') || error.message.includes('TIMEOUT'))) {
      return null;
    }
    throw error;
  }
}

async blpop(...args: any[]): Promise<[string, string] | null> {
  const client = await this.ensureConnected();
  const timeout = args[args.length - 1];
  const keys = args.slice(0, -1).map(k => ParameterTranslator.normalizeKey(k));
  
  try {
    const result = await client.customCommand(['BLPOP', ...keys, timeout.toString()]);
    
    if (result && Array.isArray(result) && result.length >= 2) {
      return [result[0], result[1]];
    }
    
    return null;
  } catch (error) {
    if (timeout > 0 && (error.message.includes('timeout') || error.message.includes('TIMEOUT'))) {
      return null;
    }
    throw error;
  }
}

async brpop(...args: any[]): Promise<[string, string] | null> {
  const client = await this.ensureConnected();
  const timeout = args[args.length - 1];
  const keys = args.slice(0, -1).map(k => ParameterTranslator.normalizeKey(k));
  
  try {
    const result = await client.customCommand(['BRPOP', ...keys, timeout.toString()]);
    
    if (result && Array.isArray(result) && result.length >= 2) {
      return [result[0], result[1]];
    }
    
    return null;
  } catch (error) {
    if (timeout > 0 && (error.message.includes('timeout') || error.message.includes('TIMEOUT'))) {
      return null;
    }
    throw error;
  }
}
```

### 4. Pub/Sub Reliability Issues

#### Current Problems
- No auto-resubscribe on reconnection
- Subscriber client isolation not maintained
- Message format inconsistencies

#### Missing Adaptations
```typescript
// src/adapters/RedisAdapter.ts - Enhanced pub/sub
private async handleReconnection(): void {
  // Auto-resubscribe to channels and patterns
  if (this.subscribedChannels.size > 0 || this.subscribedPatterns.size > 0) {
    console.log('Resubscribing to channels and patterns after reconnection');
    
    const channels = Array.from(this.subscribedChannels);
    const patterns = Array.from(this.subscribedPatterns);
    
    // Clear current subscriptions
    this.subscribedChannels.clear();
    this.subscribedPatterns.clear();
    
    // Resubscribe
    if (channels.length > 0) {
      await this.subscribe(...channels);
    }
    
    if (patterns.length > 0) {
      await this.psubscribe(...patterns);
    }
  }
}

private handlePubSubMessage(msg: any): void {
  try {
    // Enhanced message handling for different Valkey GLIDE message formats
    if (msg.channel && msg.payload !== undefined) {
      // Check if this is a pattern message
      if (msg.pattern && this.subscribedPatterns.has(msg.pattern)) {
        // Pattern message: emit pmessage
        this.emit('pmessage', msg.pattern, msg.channel, msg.payload);
      } else if (this.subscribedChannels.has(msg.channel)) {
        // Regular channel message: emit message
        this.emit('message', msg.channel, msg.payload);
      }
    }
    
    // Handle subscription confirmation messages
    if (msg.type === 'subscribe' || msg.type === 'psubscribe') {
      this.emit(msg.type, msg.channel || msg.pattern, msg.count || 1);
    }
    
    if (msg.type === 'unsubscribe' || msg.type === 'punsubscribe') {
      this.emit(msg.type, msg.channel || msg.pattern, msg.count || 0);
    }
  } catch (error) {
    console.warn('Error handling pub/sub message:', error);
    this.emit('error', error);
  }
}
```

### 5. Sorted Set Operations Enhancements

#### Current Problems
- Missing WITHSCORES support in range operations
- Inclusive/exclusive range syntax not handled
- Return type inconsistencies

#### Missing Adaptations
```typescript
// src/adapters/RedisAdapter.ts - Enhanced sorted set operations
async zrangebyscore(
  key: RedisKey,
  min: string | number,
  max: string | number,
  ...args: string[]
): Promise<string[]> {
  const client = await this.ensureConnected();
  const normalizedKey = ParameterTranslator.normalizeKey(key);
  
  // Build command arguments
  const commandArgs = [normalizedKey, min.toString(), max.toString()];
  
  // Handle additional arguments (WITHSCORES, LIMIT, etc.)
  let withScores = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i].toUpperCase();
    
    if (arg === 'WITHSCORES') {
      withScores = true;
      commandArgs.push(arg);
    } else if (arg === 'LIMIT') {
      // LIMIT offset count
      commandArgs.push(arg, args[i + 1], args[i + 2]);
      i += 2; // Skip the next two arguments
    } else {
      commandArgs.push(args[i]);
    }
  }
  
  const result = await client.customCommand(['ZRANGEBYSCORE', ...commandArgs]);
  
  // Ensure consistent return format
  if (!Array.isArray(result)) {
    return [];
  }
  
  // Convert all results to strings for ioredis compatibility
  return result.map(item => String(item));
}

async zrevrangebyscore(
  key: RedisKey,
  max: string | number,
  min: string | number,
  ...args: string[]
): Promise<string[]> {
  const client = await this.ensureConnected();
  const normalizedKey = ParameterTranslator.normalizeKey(key);
  
  const commandArgs = [normalizedKey, max.toString(), min.toString(), ...args];
  const result = await client.customCommand(['ZREVRANGEBYSCORE', ...commandArgs]);
  
  return Array.isArray(result) ? result.map(item => String(item)) : [];
}

// Add missing zpopmin/zpopmax for Bull compatibility
async zpopmin(key: RedisKey, count?: number): Promise<string[]> {
  const client = await this.ensureConnected();
  const normalizedKey = ParameterTranslator.normalizeKey(key);
  
  const commandArgs = [normalizedKey];
  if (count !== undefined) {
    commandArgs.push(count.toString());
  }
  
  const result = await client.customCommand(['ZPOPMIN', ...commandArgs]);
  return Array.isArray(result) ? result.map(item => String(item)) : [];
}

async zpopmax(key: RedisKey, count?: number): Promise<string[]> {
  const client = await this.ensureConnected();
  const normalizedKey = ParameterTranslator.normalizeKey(key);
  
  const commandArgs = [normalizedKey];
  if (count !== undefined) {
    commandArgs.push(count.toString());
  }
  
  const result = await client.customCommand(['ZPOPMAX', ...commandArgs]);
  return Array.isArray(result) ? result.map(item => String(item)) : [];
}
```

### 6. Transaction & Pipeline Improvements

#### Current Problems
- WATCH/UNWATCH not properly integrated with MULTI/EXEC
- Pipeline result format inconsistencies
- Transaction abort conditions not handled correctly

#### Missing Adaptations
```typescript
// src/adapters/RedisAdapter.ts - Enhanced MultiAdapter
class MultiAdapter implements Multi {
  // ... existing code ...
  
  async exec(): Promise<Array<[Error | null, any]> | null> {
    if (this.commands.length === 0) {
      return [];
    }

    try {
      const client = await (this.redis as any).ensureConnected();
      
      // Check for WATCH violations before executing
      if (this.watchedKeys.size > 0) {
        // Implement optimistic locking check
        const watchViolated = await this.checkWatchViolation();
        if (watchViolated) {
          return null; // Transaction aborted due to WATCH violation
        }
      }
      
      // Pre-validate commands
      for (const cmd of this.commands) {
        const validationError = await this.validateCommand(cmd.method, cmd.args);
        if (validationError) {
          return null; // Transaction aborted due to invalid command
        }
      }
      
      const batch = new Batch(true); // Atomic batch for transactions

      // Add all commands to the batch
      for (const cmd of this.commands) {
        try {
          (this as any).addCommandToBatch(batch, cmd.method, cmd.args);
        } catch (error) {
          return null; // Transaction aborted due to command error
        }
      }

      // Execute the atomic batch
      const results = await client.exec(batch, false);

      // Handle transaction abort
      if (results === null) {
        return null;
      }

      // Format results to match ioredis format
      const formattedResults: Array<[Error | null, any]> = [];

      if (results && Array.isArray(results)) {
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          if (result instanceof Error) {
            formattedResults.push([result, null]);
          } else {
            // Normalize result types
            const normalizedResult = this.normalizeResult(result);
            formattedResults.push([null, normalizedResult]);
          }
        }
      }

      return formattedResults;
    } catch (error) {
      // Transaction failed completely
      return this.commands.map(() => [error as Error, null]);
    } finally {
      // Clear commands and watched keys
      this.commands = [];
      this.watchedKeys.clear();
    }
  }
  
  private async checkWatchViolation(): Promise<boolean> {
    // Implementation depends on Valkey GLIDE's WATCH support
    // For now, assume no violation (may need enhancement)
    return false;
  }
  
  private normalizeResult(result: any): any {
    // Ensure null arrays become empty arrays
    if (result === null && this.expectsArray) {
      return [];
    }
    
    // Convert numbers to strings where ioredis would
    if (typeof result === 'number' && this.expectsStringNumber) {
      return result.toString();
    }
    
    return result;
  }
}
```

### 7. Error Handling & Compatibility

#### Current Problems
- Error messages don't match ioredis patterns
- Missing error types that libraries expect
- Connection error recovery inconsistent

#### Missing Adaptations
```typescript
// src/utils/ErrorMapper.ts - New utility
export class ErrorMapper {
  static mapValkeyError(error: any): Error {
    if (!error) return error;
    
    const message = error.message || String(error);
    
    // Map common Redis/Valkey errors to ioredis-compatible format
    if (message.includes('NOSCRIPT')) {
      const noscriptError = new Error(message);
      noscriptError.name = 'ReplyError';
      (noscriptError as any).code = 'NOSCRIPT';
      return noscriptError;
    }
    
    if (message.includes('WRONGTYPE')) {
      const wrongTypeError = new Error(message);
      wrongTypeError.name = 'ReplyError';
      (wrongTypeError as any).code = 'WRONGTYPE';
      return wrongTypeError;
    }
    
    if (message.includes('Connection')) {
      const connectionError = new Error(message);
      connectionError.name = 'ConnectionError';
      return connectionError;
    }
    
    // Default: preserve original error
    return error;
  }
}

// Apply error mapping in all command methods
async eval(script: string, numkeys: number, ...keysAndArgs: any[]): Promise<any> {
  try {
    // ... existing implementation ...
  } catch (error) {
    throw ErrorMapper.mapValkeyError(error);
  }
}
```

## Type System Enhancements

### Missing Type Definitions
```typescript
// src/types/index.ts - Additional types needed
export interface RedisEvents {
  connect: () => void;
  ready: () => void;
  error: (error: Error) => void;
  close: () => void;
  reconnecting: () => void;
  end: () => void;
  subscribe: (channel: string, count: number) => void;
  unsubscribe: (channel: string, count: number) => void;
  psubscribe: (pattern: string, count: number) => void;
  punsubscribe: (pattern: string, count: number) => void;
  message: (channel: string, message: string) => void;
  pmessage: (pattern: string, channel: string, message: string) => void;
}

// Enhanced interface with missing methods
export interface IRedisAdapter extends EventEmitter {
  // ... existing methods ...
  
  // Blocking operations
  brpoplpush(source: RedisKey, destination: RedisKey, timeout: number): Promise<string | null>;
  blpop(...args: any[]): Promise<[string, string] | null>;
  brpop(...args: any[]): Promise<[string, string] | null>;
  
  // Enhanced sorted set operations
  zrangebyscore(key: RedisKey, min: string | number, max: string | number, ...args: string[]): Promise<string[]>;
  zrevrangebyscore(key: RedisKey, max: string | number, min: string | number, ...args: string[]): Promise<string[]>;
  zpopmin(key: RedisKey, count?: number): Promise<string[]>;
  zpopmax(key: RedisKey, count?: number): Promise<string[]>;
  
  // Static factory methods
  static createClient(type: 'client' | 'subscriber' | 'bclient', options?: RedisOptions): IRedisAdapter;
}
```

## Implementation Priority

| Gap Category | Priority | Effort | Impact | Risk |
|--------------|----------|--------|--------|------|
| Lua Scripts | P0 | High | Critical | Low |
| Client Factory | P0 | Medium | Critical | Low |
| Blocking Ops | P1 | Medium | High | Medium |
| Pub/Sub Reliability | P1 | Medium | High | Low |
| ZSET Enhancements | P1 | Low | High | Low |
| Transaction Fixes | P2 | High | Medium | High |
| Error Mapping | P2 | Low | Medium | Low |

## Validation Strategy

1. **Unit Tests**: Each missing API must have comprehensive unit tests
2. **Integration Tests**: Full queue library integration scenarios
3. **Compatibility Tests**: Side-by-side comparison with native ioredis
4. **Performance Tests**: Ensure no significant performance degradation
5. **Error Scenario Tests**: Verify error handling matches ioredis behavior

## Success Criteria

- [ ] All 15 failing tests pass
- [ ] No regression in existing 391 passing tests
- [ ] Bull, Bee-Queue, BullMQ work without modifications
- [ ] Socket.IO Redis adapter works correctly
- [ ] Performance within 10% of native ioredis
- [ ] Error messages match ioredis patterns