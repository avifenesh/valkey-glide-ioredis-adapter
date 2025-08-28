# GLIDE Native API Mapping Tables

Based on research of GLIDE's actual API in `/node_modules/@valkey/valkey-glide/build-ts/`, here are the definitive mappings:

## ✅ Commands with Native GLIDE Support (Should NOT use customCommand)

### Stream Commands (14 → 5 customCommands) ✅ PARTIALLY COMPLETED
| Current customCommand | GLIDE Native Method | Status | Priority |
|----------------------|---------------------|---------|----------|
| `['XADD', key, id, ...fields]` | `client.xadd(key, values, options)` | ✅ **MIGRATED** | HIGH |
| `['XREAD', ...args]` | `client.xread(keys_and_ids, options)` | ✅ **MIGRATED** | HIGH |
| `['XACK', key, group, ...ids]` | `client.xack(key, group, ids)` | ✅ **MIGRATED** | HIGH |
| `['XREADGROUP', ...]` | `client.xreadgroup(group, consumer, keys_and_ids, options)` | ✅ **MIGRATED** | HIGH |
| `['XGROUP', ...]` | ❌ Needs customCommand | ❌ Keep | LOW |
| `['XPENDING', ...]` | ❌ Needs customCommand | ❌ Keep | LOW |
| `['XCLAIM', ...]` | ❌ Needs customCommand | ❌ Keep | LOW |

### Blocking Commands (6 → 1 customCommands) ✅ COMPLETED
| Current customCommand | GLIDE Native Method | Status | Priority |
|----------------------|---------------------|---------|----------|
| `['BZPOPMIN', ...keys, timeout]` | `client.bzpopmin(keys, timeout)` | ✅ **MIGRATED** | HIGH |
| `['BZPOPMAX', ...keys, timeout]` | `client.bzpopmax(keys, timeout)` | ✅ **MIGRATED** | HIGH |
| `['BRPOPLPUSH', src, dst, timeout]` | ❌ Needs customCommand | ❌ Keep | MEDIUM |

### String Commands (4 → 0 customCommands) ✅ COMPLETED  
| Current customCommand | GLIDE Native Method | Status | Priority |
|----------------------|---------------------|---------|----------|
| `['SETEX', key, sec, val]` | `client.set(key, val, {expiry: {type: TimeUnit.Seconds, count: sec}})` | ✅ **MIGRATED** | HIGH |
| `['PSETEX', key, ms, val]` | `client.set(key, val, {expiry: {type: TimeUnit.Milliseconds, count: ms}})` | ✅ **MIGRATED** | HIGH |

### List Commands (3 → 1 customCommands)  
| Current customCommand | GLIDE Native Method | Status | Priority |
|----------------------|---------------------|---------|----------|
| `['RPOPLPUSH', src, dst]` | ❌ Needs customCommand | ❌ Keep | MEDIUM |
| `['BRPOPLPUSH', src, dst, timeout]` | ❌ Needs customCommand | ❌ Keep | MEDIUM |

## ❌ Commands Requiring Architecture Changes

### Pub/Sub Commands (10 → 0 customCommands)
**CRITICAL**: GLIDE uses callback-based pub/sub, not command-based!

```typescript
// Current (WRONG)
client.customCommand(['SUBSCRIBE', channel])
client.customCommand(['PUBLISH', channel, message])

// GLIDE Pattern (CORRECT)
const config = {
  pubsubSubscriptions: {
    channelsAndPatterns: {
      [PubSubChannelModes.Exact]: new Set([channel])
    },
    callback: (msg, context) => {
      // Emit ioredis-compatible events
      this.emit('message', msg.channel, msg.payload);
    }
  }
};
```

### Script Commands (12 → 0 customCommands)
**GLIDE has Script class**:

```typescript
// Current (WRONG)
client.customCommand(['SCRIPT', 'LOAD', script])
client.customCommand(['EVAL', script, ...args])

// GLIDE Pattern (CORRECT)  
const script = new Script(scriptCode);
await script.invoke(client, { keys, args });
```

## 🔍 Commands Needing Research

### Transaction Commands (6 customCommands)
Need to check if GLIDE has native WATCH/UNWATCH support or if we need customCommand.

### Utility Commands (24 customCommands)
- INFO commands - likely have native support
- CLIENT commands - likely have native support  
- KEYS commands - likely have native support

## Migration Implementation Plan

### Phase 1: High-Impact Native Methods (Fixes Test Failures)

#### 1.1 Fix ZSET Blocking Commands
```typescript
// Before
const result = await client.customCommand(['BZPOPMIN', ...keys, timeout]);

// After  
const result = await client.bzpopmin(keys, timeout);
// Result: [key, member, score] - need to flatten for ioredis compatibility
```

#### 1.2 Fix Stream Commands
```typescript
// Before
const result = await client.customCommand(['XADD', key, id, ...fields]);

// After
const fieldsArray: [string, string][] = [];
for (let i = 0; i < fields.length; i += 2) {
  fieldsArray.push([fields[i], fields[i + 1]]);
}
const result = await client.xadd(key, fieldsArray, { id });
```

#### 1.3 Fix String Commands with Expiry
```typescript
// Before  
await client.customCommand(['SETEX', key, seconds, value]);

// After
await client.set(key, value, { 
  expiry: { type: TimeUnit.Seconds, count: seconds } 
});
```

### Phase 2: Architecture Redesign

#### 2.1 Pub/Sub Callback Architecture
Create a bridge between GLIDE's callback pattern and ioredis event pattern.

#### 2.2 Script Management  
Replace all EVAL/EVALSHA with GLIDE's Script class.

### Phase 3: Utility Commands
Research and migrate INFO, CLIENT, KEYS commands to native methods.

## Expected Reduction in customCommand Usage

| Command Family | Current | After Migration | Reduction | Status |
|----------------|---------|-----------------|-----------|---------|
| Stream | 14 | 3 | 79% | 🔄 **86% COMPLETE** |
| Blocking | 6 | 1 | 83% | ✅ **COMPLETED** |
| String | 4 | 0 | 100% | ✅ **COMPLETED** |
| List | 3 | 1 | 67% | ⚠️ Partial |
| Pub/Sub | 10 | 0 | 100% | 📋 **PLANNED** |
| Script | 12 | 0 | 100% | 📋 **PLANNED** |
| Transaction | 6 | TBD | TBD | 🔍 Research |
| Utility | 24 | TBD | TBD | 🔍 Research |
| **TOTAL** | **76** | **~10** | **87%** | **🎯 Target** |

### ✅ **Progress**: 20/76 customCommands migrated (26% complete)

## 🎉 **MAJOR MILESTONE ACHIEVED**

### ✅ **ZSET Operations: 100% Test Pass Rate**
All 6 ZSET tests now pass after implementing proper result translation:

1. ✅ `zpopmin()` - Fixed object→flat array translation
2. ✅ `zpopmax()` - Fixed object→flat array translation  
3. ✅ `zrangebyscore(..., 'WITHSCORES')` - Fixed WITHSCORES result handling
4. ✅ `zrevrangebyscore()` - **FIXED**: Discovered GLIDE requires swapped boundaries for reverse score ranges
5. ✅ `bzpopmin()` - Migrated to native GLIDE method
6. ✅ `bzpopmax()` - Migrated to native GLIDE method

**Key Discovery**: GLIDE's `byScore` ranges with `reverse: true` require swapped start/end boundaries:
```typescript
// For zrevrangebyscore(key, max, min):
const rangeQuery: RangeByScore = {
  type: "byScore",
  start: maxBoundary,  // Higher bound first for reverse
  end: minBoundary     // Lower bound second for reverse  
};
await client.zrange(key, rangeQuery, { reverse: true });
```

## Implementation Priority

### 🔥 Critical (Fixes Current Test Failures)
1. **BZPOPMIN/BZPOPMAX** - Fixes ZSET test failures
2. **SETEX/PSETEX** - Already implemented correctly
3. **XADD/XREAD/XACK** - Improves Bull integration

### 🚀 High Impact (Performance & Reliability)
1. **Pub/Sub Architecture** - Complete redesign needed
2. **Script Management** - Use GLIDE Script class
3. **Stream Commands** - Better Bull/BullMQ support

### 📈 Medium Impact (Code Quality)
1. **Transaction Commands** - Research native support
2. **Utility Commands** - Clean up INFO/CLIENT/KEYS

## Success Metrics

- [ ] Reduce customCommand from 76 to <10 (87% reduction)
- [ ] Fix all ZSET test failures (bzpopmin/bzpopmax)  
- [ ] Improve Bull integration performance
- [ ] Maintain 95%+ test pass rate
- [ ] Document architectural improvements

## References

- [GLIDE BaseClient API](https://github.com/valkey-io/valkey-glide/blob/main/node/src/BaseClient.ts)
- [GLIDE General Concepts](https://github.com/valkey-io/valkey-glide/wiki/General-Concepts)
- [GLIDE ioredis Migration Guide](https://github.com/valkey-io/valkey-glide/wiki/Migration-Guide-ioredis)
