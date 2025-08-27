# Test Plan for Queue Compatibility

## Current Test Status
- **Total Tests**: 406
- **Passing**: 391 (96.3%)
- **Failing**: 15 (3.7%)
- **Target**: 100% pass rate

## Test Categories to Add/Enhance

### 1. Enhanced Unit Tests

#### 1.1 Script Command Tests
```typescript
// tests/unit/script-commands-enhanced.test.ts
describe('Enhanced Script Commands', () => {
  describe('defineCommand', () => {
    test('supports variadic arguments', async () => {
      redis.defineCommand('testCmd', { lua: 'return {KEYS[1], ARGV[1]}', numberOfKeys: 1 });
      const result = await redis.testCmd('key1', 'arg1');
      expect(result).toEqual(['key1', 'arg1']);
    });
    
    test('supports array arguments (BullMQ style)', async () => {
      redis.defineCommand('testCmd', { lua: 'return {KEYS[1], ARGV[1]}', numberOfKeys: 1 });
      const result = await redis.testCmd(['key1', 'arg1']);
      expect(result).toEqual(['key1', 'arg1']);
    });
    
    test('returns arrays not null for empty results', async () => {
      redis.defineCommand('emptyCmd', { lua: 'return {}', numberOfKeys: 0 });
      const result = await redis.emptyCmd();
      expect(result).toEqual([]);
      expect(result).not.toBeNull();
    });
  });
  
  describe('eval/evalsha', () => {
    test('preserves NOSCRIPT errors', async () => {
      await expect(redis.evalsha('nonexistent', 0)).rejects.toThrow('NOSCRIPT');
    });
    
    test('handles complex return types', async () => {
      const script = 'return {1, "string", {nested = "value"}}';
      const result = await redis.eval(script, 0);
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
```

#### 1.2 Pub/Sub Reliability Tests
```typescript
// tests/unit/pubsub-reliability.test.ts
describe('Pub/Sub Reliability', () => {
  test('auto-resubscribes on reconnection', async () => {
    const messageReceived = jest.fn();
    redis.on('message', messageReceived);
    
    await redis.subscribe('test-channel');
    await redis.disconnect();
    await redis.connect();
    
    // Should auto-resubscribe
    await redis.publish('test-channel', 'test-message');
    await new Promise(resolve => setTimeout(resolve, 100));
    
    expect(messageReceived).toHaveBeenCalledWith('test-channel', 'test-message');
  });
  
  test('maintains subscriber client isolation', async () => {
    await redis.subscribe('channel1');
    
    // Regular commands should work on main client
    await expect(redis.set('key', 'value')).resolves.toBe('OK');
    await expect(redis.get('key')).resolves.toBe('value');
    
    // Subscriber state should be maintained
    expect(redis.subscribedChannels.has('channel1')).toBe(true);
  });
  
  test('handles pattern subscriptions correctly', async () => {
    const pmessageReceived = jest.fn();
    redis.on('pmessage', pmessageReceived);
    
    await redis.psubscribe('news:*');
    await redis.publish('news:sports', 'goal scored');
    
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(pmessageReceived).toHaveBeenCalledWith('news:*', 'news:sports', 'goal scored');
  });
});
```

#### 1.3 Transaction Atomicity Tests
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
    await redis2.disconnect();
    
    const result = await multi.exec();
    expect(result).toBeNull();
  });
  
  test('formats results correctly', async () => {
    const multi = redis.multi();
    multi.set('key1', 'value1');
    multi.get('key1');
    multi.get('nonexistent');
    multi.incr('counter');
    
    const results = await multi.exec();
    expect(results).toEqual([
      [null, 'OK'],
      [null, 'value1'],
      [null, null],
      [null, 1]
    ]);
  });
  
  test('handles command errors in transaction', async () => {
    const multi = redis.multi();
    multi.set('key', 'value');
    multi.lpop('key'); // Wrong type error
    multi.get('key');
    
    const results = await multi.exec();
    expect(results[0]).toEqual([null, 'OK']);
    expect(results[1][0]).toBeInstanceOf(Error);
    expect(results[2]).toEqual([null, 'value']);
  });
});
```

### 2. Enhanced Integration Tests

#### 2.1 Bull Queue Comprehensive Tests
```typescript
// tests/integration/bull-comprehensive.test.ts
describe('Bull Comprehensive Integration', () => {
  test('createClient factory pattern', () => {
    const client = RedisAdapter.createClient('client', config);
    const subscriber = RedisAdapter.createClient('subscriber', config);
    const bclient = RedisAdapter.createClient('bclient', config);
    
    expect(client).toBeInstanceOf(RedisAdapter);
    expect(subscriber).toBeInstanceOf(RedisAdapter);
    expect(bclient).toBeInstanceOf(RedisAdapter);
  });
  
  test('job processing with retries', async () => {
    const queue = new Queue('retry-test', {
      redis: config,
      defaultJobOptions: { attempts: 3, backoff: 'fixed' }
    });
    
    let attempts = 0;
    queue.process(async (job) => {
      attempts++;
      if (attempts < 3) throw new Error('Simulated failure');
      return { success: true, attempts };
    });
    
    const job = await queue.add('retry-job', { data: 'test' });
    
    await new Promise<void>((resolve) => {
      queue.on('completed', (completedJob, result) => {
        if (completedJob.id === job.id) {
          expect(result.attempts).toBe(3);
          resolve();
        }
      });
    });
  });
  
  test('delayed job execution', async () => {
    const queue = new Queue('delayed-test', { redis: config });
    const startTime = Date.now();
    const delay = 1000; // 1 second
    
    queue.process(async (job) => {
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(delay - 100);
      return { processed: true };
    });
    
    const job = await queue.add('delayed-job', { data: 'test' }, { delay });
    
    await new Promise<void>((resolve) => {
      queue.on('completed', (completedJob) => {
        if (completedJob.id === job.id) resolve();
      });
    });
  });
  
  test('job priorities', async () => {
    const queue = new Queue('priority-test', { redis: config });
    const processOrder: string[] = [];
    
    queue.process(async (job) => {
      processOrder.push(job.data.name);
      return { processed: true };
    });
    
    // Add jobs with different priorities (higher number = higher priority)
    await queue.add('low', { name: 'low' }, { priority: 1 });
    await queue.add('high', { name: 'high' }, { priority: 10 });
    await queue.add('medium', { name: 'medium' }, { priority: 5 });
    
    await new Promise<void>((resolve) => {
      let completed = 0;
      queue.on('completed', () => {
        completed++;
        if (completed === 3) {
          expect(processOrder).toEqual(['high', 'medium', 'low']);
          resolve();
        }
      });
    });
  });
  
  test('job statistics', async () => {
    const queue = new Queue('stats-test', { redis: config });
    
    queue.process(async (job) => {
      if (job.data.shouldFail) throw new Error('Intentional failure');
      return { success: true };
    });
    
    await queue.add('success1', { shouldFail: false });
    await queue.add('success2', { shouldFail: false });
    await queue.add('failure1', { shouldFail: true });
    
    await new Promise<void>((resolve) => {
      let processed = 0;
      queue.on('completed', () => processed++);
      queue.on('failed', () => processed++);
      
      const checkStats = () => {
        if (processed === 3) {
          setTimeout(async () => {
            const completed = await queue.getCompleted();
            const failed = await queue.getFailed();
            
            expect(completed).toHaveLength(2);
            expect(failed).toHaveLength(1);
            expect(completed).not.toBeNull();
            expect(failed).not.toBeNull();
            resolve();
          }, 100);
        }
      };
      
      queue.on('completed', checkStats);
      queue.on('failed', checkStats);
    });
  });
});
```

#### 2.2 Bee-Queue Enhanced Tests
```typescript
// tests/integration/bee-queue-enhanced.test.ts
describe('Bee-Queue Enhanced Integration', () => {
  test('delayed jobs with precise timing', async () => {
    const queue = new BeeQueue('delayed-precise', {
      redis: config,
      prefix: 'test:bee:'
    });
    
    const delay = 1500; // 1.5 seconds
    const tolerance = 200; // 200ms tolerance
    const startTime = Date.now();
    
    queue.process(async (job) => {
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(delay - tolerance);
      expect(elapsed).toBeLessThanOrEqual(delay + tolerance);
      return { processed: true, elapsed };
    });
    
    const job = queue.createJob({ message: 'delayed' }).delay(delay);
    await new Promise((resolve, reject) => {
      job.save((err) => err ? reject(err) : resolve(undefined));
    });
    
    await new Promise<void>((resolve) => {
      queue.on('succeeded', (job, result) => {
        expect(result.processed).toBe(true);
        resolve();
      });
    });
  });
  
  test('prefix preservation', async () => {
    const prefix = 'custom:prefix:';
    const queue = new BeeQueue('prefix-test', {
      redis: config,
      prefix
    });
    
    const job = queue.createJob({ data: 'test' });
    await new Promise((resolve, reject) => {
      job.save((err) => err ? reject(err) : resolve(undefined));
    });
    
    // Check that keys are created with correct prefix
    const keys = await redis.keys(`${prefix}*`);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every(key => key.startsWith(prefix))).toBe(true);
  });
});
```

### 3. Blocking Operations Tests

```typescript
// tests/unit/blocking-operations.test.ts
describe('Blocking Operations', () => {
  test('brpoplpush with timeout', async () => {
    await redis.lpush('source', 'item1', 'item2');
    
    const result = await redis.brpoplpush('source', 'dest', 1);
    expect(result).toBe('item1');
    
    const destItems = await redis.lrange('dest', 0, -1);
    expect(destItems).toEqual(['item1']);
  });
  
  test('brpoplpush timeout behavior', async () => {
    const startTime = Date.now();
    const result = await redis.brpoplpush('empty-source', 'dest', 1);
    const elapsed = Date.now() - startTime;
    
    expect(result).toBeNull();
    expect(elapsed).toBeGreaterThanOrEqual(1000);
    expect(elapsed).toBeLessThanOrEqual(1200);
  });
  
  test('blpop multiple keys', async () => {
    await redis.lpush('list2', 'item2');
    
    const result = await redis.blpop('list1', 'list2', 1);
    expect(result).toEqual(['list2', 'item2']);
  });
  
  test('blpop timeout', async () => {
    const result = await redis.blpop('empty-list', 1);
    expect(result).toBeNull();
  });
});
```

### 4. Sorted Set Enhanced Tests

```typescript
// tests/unit/sorted-set-enhanced.test.ts
describe('Sorted Set Enhanced', () => {
  test('zrangebyscore with WITHSCORES', async () => {
    await redis.zadd('zset', 1, 'one', 2, 'two', 3, 'three');
    
    const result = await redis.zrangebyscore('zset', 1, 2, 'WITHSCORES');
    expect(result).toEqual(['one', '1', 'two', '2']);
  });
  
  test('zrangebyscore with LIMIT', async () => {
    await redis.zadd('zset', 1, 'one', 2, 'two', 3, 'three', 4, 'four');
    
    const result = await redis.zrangebyscore('zset', 1, 4, 'LIMIT', '1', '2');
    expect(result).toEqual(['two', 'three']);
  });
  
  test('exclusive range syntax', async () => {
    await redis.zadd('zset', 1, 'one', 2, 'two', 3, 'three');
    
    const result = await redis.zrangebyscore('zset', '(1', '(3');
    expect(result).toEqual(['two']);
  });
  
  test('infinite range syntax', async () => {
    await redis.zadd('zset', 1, 'one', 2, 'two', 3, 'three');
    
    const result = await redis.zrangebyscore('zset', '-inf', '+inf');
    expect(result).toEqual(['one', 'two', 'three']);
  });
});
```

### 5. Performance & Stress Tests

```typescript
// tests/performance/queue-performance.test.ts
describe('Queue Performance Tests', () => {
  test('high-throughput job processing', async () => {
    const queue = new Queue('perf-test', { redis: config });
    const jobCount = 1000;
    const startTime = Date.now();
    
    let processed = 0;
    queue.process(10, async (job) => { // 10 concurrent workers
      processed++;
      return { processed: true };
    });
    
    // Add jobs
    const jobs = Array.from({ length: jobCount }, (_, i) => 
      queue.add('perf-job', { id: i })
    );
    await Promise.all(jobs);
    
    // Wait for completion
    await new Promise<void>((resolve) => {
      queue.on('completed', () => {
        if (processed === jobCount) {
          const elapsed = Date.now() - startTime;
          const throughput = jobCount / (elapsed / 1000);
          console.log(`Processed ${jobCount} jobs in ${elapsed}ms (${throughput.toFixed(2)} jobs/sec)`);
          expect(throughput).toBeGreaterThan(100); // Minimum 100 jobs/sec
          resolve();
        }
      });
    });
  });
  
  test('memory usage under load', async () => {
    const initialMemory = process.memoryUsage().heapUsed;
    
    // Create many connections
    const adapters = Array.from({ length: 100 }, () => new RedisAdapter(config));
    await Promise.all(adapters.map(adapter => adapter.connect()));
    
    const peakMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = peakMemory - initialMemory;
    
    // Cleanup
    await Promise.all(adapters.map(adapter => adapter.disconnect()));
    
    // Memory increase should be reasonable (less than 100MB for 100 connections)
    expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
  });
});
```

## Test Execution Strategy

### 1. Continuous Integration
- Run all tests on every commit
- Separate test stages: unit → integration → performance
- Fail fast on critical test failures

### 2. Test Environment Setup
```bash
# docker-compose.test.yml enhancement
version: '3.8'
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
  
  valkey:
    image: valkey/valkey:7.2
    ports:
      - "6380:6379"
  
  test-runner:
    build: .
    depends_on:
      - redis
      - valkey
    environment:
      - REDIS_HOST=redis
      - VALKEY_HOST=valkey
    command: npm test
```

### 3. Test Data Management
- Use unique prefixes for each test
- Clean up test data after each test
- Parallel test execution with isolated data

### 4. Monitoring & Reporting
- Test coverage reports
- Performance regression detection
- Memory leak detection
- Error rate monitoring

## Success Metrics

### Functional Metrics
- [ ] 100% test pass rate (406/406 tests)
- [ ] All Bull integration scenarios working
- [ ] All Bee-Queue scenarios working
- [ ] All BullMQ scenarios working

### Performance Metrics
- [ ] <10% latency increase vs native ioredis
- [ ] >100 jobs/sec throughput for Bull queues
- [ ] <100MB memory overhead for 100 connections
- [ ] <5 second connection recovery time

### Quality Metrics
- [ ] >95% code coverage
- [ ] Zero memory leaks in 24h stress test
- [ ] <1% error rate under normal load
- [ ] All error messages match ioredis patterns