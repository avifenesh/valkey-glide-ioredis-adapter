# ioredis Adapter Implementation Plan

## Executive Summary

Based on `TEST_FAILURES_ANALYSIS.md` and our knowledge base analysis, we need to fix 15 failing tests (3.7% failure rate) concentrated in Bull/Bee-Queue integration. The plan addresses Lua script compatibility, pub/sub reliability, transaction atomicity, and client factory patterns.

## Phase 1: Critical Fixes (Week 1-2)

### 1.1 Lua Script & Custom Command Fixes

**Problem**: Bull's `getCompleted()` returns null instead of arrays; `defineCommand` argument handling inconsistent.

**Changes Required**:
- `src/adapters/RedisAdapter.ts` - `defineCommand()` method:
  - Support both variadic args `(key1, key2, arg1, arg2)` and array style `([key1, key2, arg1, arg2])`
  - Ensure KEYS/ARGV split by `numberOfKeys` is exact
  - Return arrays instead of null for empty results
- `eval()`/`evalsha()` methods:
  - Normalize return types to match ioredis (strings for numbers when expected)
  - Preserve NOSCRIPT errors for caller retry logic

**Tests Needed**:
```typescript
// tests/unit/script-commands-enhanced.test.ts
describe('Enhanced Script Commands', () => {
  test('defineCommand supports both argument styles', async () => {
    redis.defineCommand('testCmd', { lua: 'return {KEYS[1], ARGV[1]}', numberOfKeys: 1 });
    
    // Variadic style
    const result1 = await redis.testCmd('key1', 'arg1');
    expect(result1).toEqual(['key1', 'arg1']);
    
    // Array style (BullMQ)
    const result2 = await redis.testCmd(['key1', 'arg1']);
    expect(result2).toEqual(['key1', 'arg1']);
  });
  
  test('eval returns arrays not null for empty results', async () => {
    const result = await redis.eval('return {}', 0);
    expect(result).toEqual([]);
    expect(result).not.toBeNull();
  });
});
```

### 1.2 Pub/Sub Reliability & Reconnection

**Problem**: Bull events not firing; subscriber mode issues.

**Changes Required**:
- `src/adapters/RedisAdapter.ts` - pub/sub methods:
  - Fix `handlePubSubMessage()` to properly map Valkey GLIDE callback structure
  - Implement auto-resubscribe on reconnection
  - Ensure subscriber client stays in subscriber mode
- Add connection state management for pub/sub

**Tests Needed**:
```typescript
// tests/unit/pubsub-reliability.test.ts
describe('Pub/Sub Reliability', () => {
  test('resubscribes on reconnection', async () => {
    await redis.subscribe('test-channel');
    await redis.disconnect();
    await redis.connect();
    
    // Should auto-resubscribe
    expect(redis.subscribedChannels.has('test-channel')).toBe(true);
  });
  
  test('subscriber client isolation', async () => {
    await redis.subscribe('channel1');
    
    // Regular commands should use main client
    await expect(redis.set('key', 'value')).resolves.toBe('OK');
    
    // Subscriber client should only handle pub/sub
    expect(redis.isInSubscriberMode).toBe(true);
  });
});
```

### 1.3 Transaction Atomicity (MULTI/EXEC)

**Problem**: Bull retry mechanisms failing; transaction results format incorrect.

**Changes Required**:
- `src/adapters/RedisAdapter.ts` - `MultiAdapter.exec()`:
  - Ensure `Batch(true)` provides true atomicity
  - Return `null` on transaction abort (WATCH violations)
  - Format results as `[[Error|null, result], ...]`
- Implement proper WATCH/UNWATCH semantics

**Tests Needed**:
```typescript
// tests/unit/transaction-atomicity.test.ts
describe('Transaction Atomicity', () => {
  test('returns null on WATCH violation', async () => {
    await redis.set('watched-key', '1');
    await redis.watch('watched-key');
    
    const multi = redis.multi();
    multi.set('watched-key', '2');
    
    // Simulate external change
    const redis2 = new RedisAdapter(config);
    await redis2.connect();
    await redis2.set('watched-key', 'changed');
    
    const result = await multi.exec();
    expect(result).toBeNull(); // Transaction aborted
  });
  
  test('formats results correctly', async () => {
    const multi = redis.multi();
    multi.set('key1', 'value1');
    multi.get('key1');
    multi.get('nonexistent');
    
    const results = await multi.exec();
    expect(results).toEqual([
      [null, 'OK'],
      [null, 'value1'],
      [null, null]
    ]);
  });
});
```

## Phase 2: Queue Integration Fixes (Week 3-4)

### 2.1 Bull Queue Compatibility

**Problem**: Job processing timeouts, delays, priorities, retries, statistics all failing.

**Changes Required**:
- Implement `createClient(type)` static factory:
```typescript
// src/adapters/RedisAdapter.ts
static createClient(type: 'client' | 'subscriber' | 'bclient', options: RedisOptions): RedisAdapter {
  const adapter = new RedisAdapter(options);
  
  if (type === 'bclient') {
    // Enable blocking operations support
    adapter.enableBlockingOps = true;
  }
  
  // Connect asynchronously - Bull expects immediate return
  adapter.connect().catch(err => adapter.emit('error', err));
  return adapter;
}
```

- Add blocking operations support:
```typescript
async brpoplpush(source: string, destination: string, timeout: number): Promise<string | null> {
  const client = await this.ensureConnected();
  try {
    return await client.customCommand(['BRPOPLPUSH', source, destination, timeout.toString()]);
  } catch (error) {
    if (timeout > 0 && error.message.includes('timeout')) {
      return null; // Expected timeout behavior
    }
    throw error;
  }
}
```

**Tests Needed**:
```typescript
// tests/integration/bull-enhanced.test.ts
describe('Bull Enhanced Integration', () => {
  test('createClient factory works', () => {
    const client = RedisAdapter.createClient('client', config);
    const subscriber = RedisAdapter.createClient('subscriber', config);
    const bclient = RedisAdapter.createClient('bclient', config);
    
    expect(client).toBeInstanceOf(RedisAdapter);
    expect(subscriber).toBeInstanceOf(RedisAdapter);
    expect(bclient).toBeInstanceOf(RedisAdapter);
    expect(bclient.enableBlockingOps).toBe(true);
  });
  
  test('blocking operations work', async () => {
    await redis.lpush('source-list', 'item1');
    
    const result = await redis.brpoplpush('source-list', 'dest-list', 1);
    expect(result).toBe('item1');
    
    const destItems = await redis.lrange('dest-list', 0, -1);
    expect(destItems).toEqual(['item1']);
  });
});
```

### 2.2 Sorted Set Operations (Delays/Priorities)

**Problem**: Bull/Bee-Queue delay and priority mechanisms failing.

**Changes Required**:
- Audit all ZSET commands for ioredis compatibility:
```typescript
// src/adapters/RedisAdapter.ts
async zrangebyscore(
  key: RedisKey, 
  min: string | number, 
  max: string | number, 
  ...args: string[]
): Promise<string[]> {
  const client = await this.ensureConnected();
  const normalizedKey = ParameterTranslator.normalizeKey(key);
  
  // Handle WITHSCORES option
  const withScores = args.includes('WITHSCORES');
  const commandArgs = [normalizedKey, min.toString(), max.toString(), ...args];
  
  const result = await client.customCommand(['ZRANGEBYSCORE', ...commandArgs]);
  
  // Ensure consistent return format
  return Array.isArray(result) ? result.map(String) : [];
}
```

**Tests Needed**:
```typescript
// tests/unit/sorted-set-enhanced.test.ts
describe('Sorted Set Enhanced', () => {
  test('zrangebyscore with WITHSCORES', async () => {
    await redis.zadd('zset', 1, 'one', 2, 'two', 3, 'three');
    
    const result = await redis.zrangebyscore('zset', 1, 2, 'WITHSCORES');
    expect(result).toEqual(['one', '1', 'two', '2']);
  });
  
  test('handles inclusive/exclusive ranges', async () => {
    await redis.zadd('zset', 1, 'one', 2, 'two', 3, 'three');
    
    const exclusive = await redis.zrangebyscore('zset', '(1', '(3');
    expect(exclusive).toEqual(['two']);
  });
});
```

### 2.3 Bee-Queue Delay Mechanics

**Changes Required**:
- Ensure ZSET timestamp handling is precise
- Fix prefix/keyPrefix preservation
- Verify Lua script return value unpacking

**Tests Needed**:
```typescript
// tests/integration/bee-queue-enhanced.test.ts
describe('Bee-Queue Enhanced', () => {
  test('delayed jobs execute at correct time', async () => {
    const queue = new BeeQueue('delayed-test', {
      redis: { port: config.port, host: config.host },
      prefix: 'test:bee:'
    });
    
    const delay = 1000; // 1 second
    const startTime = Date.now();
    
    const job = queue.createJob({ message: 'delayed' }).delay(delay);
    await new Promise((resolve, reject) => {
      job.save((err) => err ? reject(err) : resolve(undefined));
    });
    
    await new Promise<void>((resolve) => {
      queue.process(async (job) => {
        const elapsed = Date.now() - startTime;
        expect(elapsed).toBeGreaterThanOrEqual(delay - 100); // Allow 100ms tolerance
        resolve();
        return { processed: true };
      });
    });
  });
});
```

## Phase 3: Missing API Adaptations (Week 5)

### 3.1 Blocking Operations Support

**Missing APIs**:
- `brpoplpush(source, dest, timeout)`
- `blpop(keys, timeout)`
- `brpop(keys, timeout)`

**Implementation**:
```typescript
// src/adapters/RedisAdapter.ts
async blpop(...args: any[]): Promise<[string, string] | null> {
  const client = await this.ensureConnected();
  const timeout = args[args.length - 1];
  const keys = args.slice(0, -1).map(k => ParameterTranslator.normalizeKey(k));
  
  try {
    const result = await client.customCommand(['BLPOP', ...keys, timeout.toString()]);
    return result ? [result[0], result[1]] : null;
  } catch (error) {
    if (error.message.includes('timeout')) return null;
    throw error;
  }
}
```

### 3.2 Enhanced Error Handling

**Changes Required**:
- Map Valkey GLIDE errors to ioredis-compatible errors
- Ensure error messages match expected patterns
- Add error recovery for connection issues

### 3.3 Performance Optimizations

**Changes Required**:
- Implement command pipelining optimizations
- Add connection pooling for high-concurrency scenarios
- Optimize argument serialization/deserialization

## Phase 4: Integration Testing & Validation (Week 6)

### 4.1 Comprehensive Integration Tests

**Test Suites to Add**:
```typescript
// tests/integration/queue-compatibility-matrix.test.ts
describe('Queue Compatibility Matrix', () => {
  const queueLibraries = [
    { name: 'Bull', factory: () => new Queue('test', { redis: config }) },
    { name: 'BullMQ', factory: () => new BullMQQueue('test', { connection: config }) },
    { name: 'Bee-Queue', factory: () => new BeeQueue('test', { redis: config }) }
  ];
  
  queueLibraries.forEach(({ name, factory }) => {
    describe(`${name} Integration`, () => {
      test('basic job processing', async () => { /* ... */ });
      test('delayed jobs', async () => { /* ... */ });
      test('job priorities', async () => { /* ... */ });
      test('job retries', async () => { /* ... */ });
      test('job statistics', async () => { /* ... */ });
    });
  });
});
```

### 4.2 Performance Benchmarks

**Benchmarks to Add**:
- Command execution latency vs native ioredis
- Memory usage under load
- Connection handling efficiency
- Pub/sub message throughput

### 4.3 Stress Testing

**Stress Tests**:
- High-concurrency job processing
- Large payload handling
- Connection recovery scenarios
- Memory leak detection

## Implementation Priority Matrix

| Component | Priority | Effort | Impact | Dependencies |
|-----------|----------|--------|--------|--------------|
| Lua Script Fixes | P0 | High | High | None |
| Pub/Sub Reliability | P0 | Medium | High | None |
| Transaction Atomicity | P0 | Medium | High | None |
| Bull createClient | P1 | Low | High | Lua Scripts |
| Blocking Operations | P1 | Medium | Medium | None |
| ZSET Enhancements | P1 | Medium | High | None |
| Error Handling | P2 | Low | Medium | All above |
| Performance Opts | P3 | High | Low | All above |

## Success Criteria

### Functional Requirements
- [ ] All 15 failing tests pass
- [ ] No regression in existing 391 passing tests
- [ ] Bull job processing works end-to-end
- [ ] Bee-Queue delayed jobs execute correctly
- [ ] BullMQ scripts execute without errors

### Performance Requirements
- [ ] <10% performance degradation vs native ioredis
- [ ] Memory usage within 20% of baseline
- [ ] Connection recovery <5 seconds

### Quality Requirements
- [ ] Test coverage >95%
- [ ] No memory leaks under load
- [ ] Error messages match ioredis patterns
- [ ] Documentation updated

## Risk Mitigation

### High Risk Items
1. **Valkey GLIDE Blocking Ops**: If not supported, implement polling fallbacks
2. **Lua Script Compatibility**: May need custom script translation layer
3. **Performance Impact**: Monitor and optimize critical paths

### Mitigation Strategies
- Feature flags for new implementations
- Gradual rollout with monitoring
- Fallback to native ioredis for critical operations
- Comprehensive logging and metrics

## Delivery Timeline

- **Week 1-2**: Phase 1 (Critical Fixes)
- **Week 3-4**: Phase 2 (Queue Integration)  
- **Week 5**: Phase 3 (Missing APIs)
- **Week 6**: Phase 4 (Testing & Validation)

**Milestone**: 100% test pass rate by end of Week 6.