# Architectural Analysis: GLIDE Native API Migration

## Executive Summary

**Critical Issue Identified**: We are using 76 `customCommand` calls across 10 files, treating GLIDE as a generic Redis protocol proxy instead of leveraging its rich native API. This is fundamentally wrong architecture.

**Impact**: 
- Poor performance (bypassing GLIDE optimizations)
- Missing type safety and validation
- Increased error potential
- Not leveraging GLIDE's advanced features (pipelining, multi-slot handling, etc.)

**Solution**: Migrate from command proxy pattern to native API translation layer.

## Current State Analysis

### CustomCommand Usage Breakdown (76 total)

#### 1. **Stream Commands** (14 usages)
```typescript
// Current (WRONG)
client.customCommand(['XADD', key, id, ...fields])
client.customCommand(['XREAD', ...args])
client.customCommand(['XACK', key, group, ...ids])
client.customCommand(['XGROUP', subcommand, ...args])
client.customCommand(['XPENDING', key, group, ...args])
client.customCommand(['XCLAIM', key, group, consumer, ...ids])

// Should be (CORRECT)
client.xadd(key, fieldsAndValues, { id })
client.xread(streams, { block: timeout })
client.xack(key, group, ids)
// etc.
```

#### 2. **Pub/Sub Commands** (10 usages)
```typescript
// Current (WRONG)
client.customCommand(['SUBSCRIBE', channel])
client.customCommand(['UNSUBSCRIBE', channel])
client.customCommand(['PSUBSCRIBE', pattern])
client.customCommand(['PUNSUBSCRIBE', pattern])

// Should be (CORRECT)
// GLIDE has native pub/sub with callbacks - completely different pattern!
```

#### 3. **Script Commands** (12 usages)
```typescript
// Current (WRONG)
client.customCommand(['SCRIPT', 'LOAD', script])
client.customCommand(['SCRIPT', 'EXISTS', ...scripts])
client.customCommand(['EVAL', script, ...args])
client.customCommand(['EVALSHA', sha, ...args])

// Should be (CORRECT)
const script = new Script(scriptCode)
await script.invoke(client, { keys, args })
```

#### 4. **Blocking Commands** (6 usages)
```typescript
// Current (WRONG)
client.customCommand(['BZPOPMIN', ...keys, timeout])
client.customCommand(['BZPOPMAX', ...keys, timeout])
client.customCommand(['BRPOPLPUSH', source, dest, timeout])

// Should be (CORRECT)
client.bzpopmin(keys, timeout)
client.bzpopmax(keys, timeout)
// BRPOPLPUSH might need customCommand (check GLIDE API)
```

#### 5. **Transaction Commands** (6 usages)
```typescript
// Current (WRONG)
client.customCommand(['WATCH', ...keys])
client.customCommand(['UNWATCH'])

// Should be (CORRECT)
// Check if GLIDE has native transaction support
```

#### 6. **Cluster String Commands** (4 usages)
```typescript
// Current (WRONG)
client.customCommand(['SETEX', key, seconds, value])
client.customCommand(['PSETEX', key, ms, value])

// Should be (CORRECT)
client.set(key, value, { expiry: { type: TimeUnit.Seconds, count: seconds }})
client.set(key, value, { expiry: { type: TimeUnit.Milliseconds, count: ms }})
```

#### 7. **Utility Commands** (24 usages)
- INFO commands
- CLIENT commands  
- KEYS commands
- Generic sendCommand implementations

## Root Cause Analysis

### 1. **Lack of GLIDE API Knowledge**
We didn't properly study GLIDE's native methods and their capabilities.

### 2. **ioredis-Centric Thinking**
We tried to replicate ioredis behavior exactly instead of translating to GLIDE patterns.

### 3. **Missing Translation Layers**
We need proper parameter/result translation between ioredis and GLIDE formats.

### 4. **No Architecture Documentation**
We didn't establish clear principles for when to use customCommand vs native methods.

## Migration Strategy

### Phase 1: API Mapping (Immediate)
Create comprehensive mapping tables:

#### String Commands
| ioredis Method | GLIDE Native Method | Translation Needed |
|----------------|---------------------|-------------------|
| `setex(key, sec, val)` | `set(key, val, {expiry: {type: TimeUnit.Seconds, count: sec}})` | Parameter restructuring |
| `psetex(key, ms, val)` | `set(key, val, {expiry: {type: TimeUnit.Milliseconds, count: ms}})` | Parameter restructuring |

#### Stream Commands  
| ioredis Method | GLIDE Native Method | Translation Needed |
|----------------|---------------------|-------------------|
| `xadd(key, id, ...fields)` | `xadd(key, fieldsAndValues, {id})` | Parameter restructuring |
| `xread(...)` | `xread(streams, options)` | Complex parameter mapping |

#### Pub/Sub Commands
| ioredis Method | GLIDE Native Method | Translation Needed |
|----------------|---------------------|-------------------|
| `subscribe(channel)` | Callback-based pattern | Complete paradigm shift |
| `publish(channel, msg)` | `publish(channel, message)` | Direct mapping |

### Phase 2: Implementation Layers

#### Layer 1: Parameter Translation
```typescript
class ParameterTranslator {
  static translateSetOptions(args: any[]): SetOptions {
    // Convert ioredis SET args to GLIDE SetOptions
  }
  
  static translateStreamArgs(args: any[]): StreamReadOptions {
    // Convert ioredis XREAD args to GLIDE options
  }
}
```

#### Layer 2: Result Translation  
```typescript
class ResultTranslator {
  static flattenZSetWithScores(glideResult: ScoredMember[]): string[] {
    // Convert [{member: 'a', score: 1}] to ['a', '1']
  }
  
  static formatStreamEntries(glideResult: StreamEntry[]): any[] {
    // Convert GLIDE stream format to ioredis format
  }
}
```

#### Layer 3: Native Method Wrappers
```typescript
class StringCommands {
  async setex(key: string, seconds: number, value: string): Promise<string> {
    const client = await this.getClient();
    await client.set(key, value, { 
      expiry: { type: TimeUnit.Seconds, count: seconds } 
    });
    return 'OK';
  }
}
```

### Phase 3: Pub/Sub Architecture Redesign

GLIDE uses callback-based pub/sub, which is fundamentally different from ioredis:

```typescript
// GLIDE Pattern (Correct)
const config = {
  pubsubCallback: {
    callback: (msg, context) => {
      // Handle message
    },
    context: this
  }
};

// ioredis Pattern (What we need to emulate)
redis.on('message', (channel, message) => {
  // Handle message  
});
```

### Phase 4: Performance Optimization

#### Leverage GLIDE Features:
1. **Automatic Pipelining**: Remove manual pipeline management
2. **Multi-Slot Handling**: Let GLIDE handle cluster operations automatically  
3. **Type Safety**: Use GLIDE's TypeScript interfaces
4. **Connection Pooling**: Leverage GLIDE's connection management

## Expected Outcomes

### Performance Improvements
- **Reduced Latency**: Native methods avoid protocol serialization overhead
- **Better Pipelining**: GLIDE's automatic pipelining vs manual batching
- **Type Safety**: Compile-time error detection

### Code Quality Improvements  
- **Reduced Complexity**: From 76 customCommands to ~5-10 truly necessary ones
- **Better Maintainability**: Clear separation between translation and execution
- **Future-Proof**: Automatic access to new GLIDE features

### Compatibility Improvements
- **ZSET Issues Fixed**: Proper result translation (objects → flat arrays)
- **Bull Integration**: Better performance and reliability
- **Cluster Support**: Leverage GLIDE's native multi-slot handling

## Implementation Priority

### High Priority (Fixes Current Test Failures)
1. **ZSET Commands**: Fix object→array translation
2. **Stream Commands**: Native XADD, XREAD, etc.
3. **Pub/Sub**: Redesign callback architecture

### Medium Priority (Performance & Reliability)  
1. **Script Commands**: Use GLIDE Script class
2. **Blocking Commands**: Native BZPOP* methods
3. **Transaction Commands**: Native WATCH/UNWATCH if available

### Low Priority (Cleanup)
1. **Utility Commands**: INFO, CLIENT, etc.
2. **Generic sendCommand**: Minimize usage

## Success Metrics

- [ ] Reduce customCommand usage from 76 to <10
- [ ] Fix all ZSET test failures  
- [ ] Improve Bull integration performance
- [ ] Maintain 95%+ test pass rate
- [ ] Document remaining customCommand usage with justification

## Next Steps

1. **Create API mapping tables** for each command family
2. **Implement parameter/result translators** 
3. **Migrate high-priority commands** first
4. **Redesign pub/sub architecture**
5. **Performance testing and validation**

## References

- [GLIDE General Concepts](https://github.com/valkey-io/valkey-glide/wiki/General-Concepts)
- [GLIDE ioredis Migration Guide](https://github.com/valkey-io/valkey-glide/wiki/Migration-Guide-ioredis)
- GLIDE API Documentation (Node.js)
