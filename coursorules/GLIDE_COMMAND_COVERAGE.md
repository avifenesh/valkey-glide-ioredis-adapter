# GLIDE Command Coverage Analysis

## Executive Summary

Based on the [GLIDE Commands Implementation Progress](https://github.com/valkey-io/valkey-glide/wiki/ValKey-Commands-Implementation-Progress), this document provides a comprehensive analysis of command availability in GLIDE Node.js implementation and their migration implications.

## 🎯 **Command Implementation Status**

### **✅ Fully Implemented Commands (Node.js: Done)**

#### **Core Commands**
| Command | Status | Migration Impact |
|---------|--------|------------------|
| `ping` | ✅ Done | Use native `client.ping()` |
| `info` | ✅ Done | Use native `client.info(sections?)` |
| `select` | ✅ Done | Use native `client.select(db)` |
| `auth` | ✅ API not required | Handled via configuration |
| `quit` | ✅ API not required | Handled via connection management |

#### **String Commands**
| Command | Status | Migration Impact |
|---------|--------|------------------|
| `set` | ✅ Done | Use native `client.set(key, value, options?)` |
| `get` | ✅ Done | Use native `client.get(key)` |
| `mset` | ✅ Done | Use native `client.mset(keyValueMap)` |
| `mget` | ✅ Done | Use native `client.mget(keys)` |
| `incr` | ✅ Done | Use native `client.incr(key)` |
| `incrby` | ✅ Done | Use native `client.incrby(key, amount)` |
| `incrbyfloat` | ✅ Done | Use native `client.incrbyfloat(key, amount)` |
| `decr` | ✅ Done | Use native `client.decr(key)` |
| `decrby` | ✅ Done | Use native `client.decrby(key, amount)` |
| `getdel` | ✅ Done | Use native `client.getdel(key)` |
| `getex` | ✅ Done | Use native `client.getex(key, options?)` |

#### **Hash Commands**
| Command | Status | Migration Impact |
|---------|--------|------------------|
| `hset` | ✅ Done | Use native `client.hset(key, fieldValueMap)` |
| `hget` | ✅ Done | Use native `client.hget(key, field)` |
| `hgetall` | ✅ Done | Use native `client.hgetall(key)` |
| `hdel` | ✅ Done | Use native `client.hdel(key, fields)` |
| `hmget` | ✅ Done | Use native `client.hmget(key, fields)` |
| `hexists` | ✅ Done | Use native `client.hexists(key, field)` |
| `hincrby` | ✅ Done | Use native `client.hincrby(key, field, amount)` |
| `hincrbyfloat` | ✅ Done | Use native `client.hincrbyfloat(key, field, amount)` |
| `hstrlen` | ✅ Done | Use native `client.hstrlen(key, field)` |
| `hmset` | ❌ Deprecated | Use `hset` instead |

#### **List Commands**
| Command | Status | Migration Impact |
|---------|--------|------------------|
| `lpush` | ✅ Done | Use native `client.lpush(key, elements)` |
| `rpush` | ✅ Done | Use native `client.rpush(key, elements)` |
| `lpop` | ✅ Done | Use native `client.lpop(key, count?)` |
| `rpop` | ✅ Done | Use native `client.rpop(key, count?)` |
| `llen` | ✅ Done | Use native `client.llen(key)` |
| `lrange` | ✅ Done | Use native `client.lrange(key, start, end)` |
| `ltrim` | ✅ Done | Use native `client.ltrim(key, start, end)` |
| `lindex` | ✅ Done | Use native `client.lindex(key, index)` |
| `lset` | ✅ Done | Use native `client.lset(key, index, element)` |
| `lrem` | ✅ Done | Use native `client.lrem(key, count, element)` |
| `linsert` | ✅ Done | Use native `client.linsert(key, position, pivot, element)` |
| `blpop` | ✅ Done | Use native `client.blpop(keys, timeout)` |
| `brpop` | ✅ Done | Use native `client.brpop(keys, timeout)` |
| `lmove` | ✅ Done | Use native `client.lmove(source, dest, from, to)` |
| `blmove` | ✅ Done | Use native `client.blmove(source, dest, from, to, timeout)` |
| `lmpop` | ✅ Done | Use native `client.lmpop(keys, direction, count?)` |
| `blmpop` | ✅ Done | Use native `client.blmpop(keys, direction, timeout, count?)` |
| `brpoplpush` | ❌ Deprecated | Use `blmove` instead |

#### **Set Commands**
| Command | Status | Migration Impact |
|---------|--------|------------------|
| `sadd` | ✅ Done | Use native `client.sadd(key, members)` |
| `srem` | ✅ Done | Use native `client.srem(key, members)` |
| `smembers` | ✅ Done | Use native `client.smembers(key)` |
| `scard` | ✅ Done | Use native `client.scard(key)` |
| `sismember` | ✅ Done | Use native `client.sismember(key, member)` |
| `spop` | ✅ Done | Use native `client.spop(key, count?)` |
| `srandmember` | ✅ Done | Use native `client.srandmember(key, count?)` |
| `sunion` | ✅ Done | Use native `client.sunion(keys)` |
| `sinter` | ✅ Done | Use native `client.sinter(keys)` |
| `sdiff` | ✅ Done | Use native `client.sdiff(keys)` |
| `sunionstore` | ✅ Done | Use native `client.sunionstore(dest, keys)` |
| `sinterstore` | ✅ Done | Use native `client.sinterstore(dest, keys)` |
| `sdiffstore` | ✅ Done | Use native `client.sdiffstore(dest, keys)` |
| `sintercard` | ✅ Done | Use native `client.sintercard(keys, limit?)` |

#### **Sorted Set Commands**
| Command | Status | Migration Impact |
|---------|--------|------------------|
| `zadd` | ✅ Done | Use native `client.zadd(key, membersScoresMap, options?)` |
| `zrem` | ✅ Done | Use native `client.zrem(key, members)` |
| `zcard` | ✅ Done | Use native `client.zcard(key)` |
| `zcount` | ✅ Done | Use native `client.zcount(key, minScore, maxScore)` |
| `zrange` | ✅ Done | Use native `client.zrange(key, rangeQuery, options?)` |
| `zrank` | ✅ Done | Use native `client.zrank(key, member)` |
| `zrevrank` | ✅ Done | Use native `client.zrevrank(key, member)` |
| `zscore` | ✅ Done | Use native `client.zscore(key, member)` |
| `zpopmin` | ✅ Done | Use native `client.zpopmin(key, count?)` |
| `zpopmax` | ✅ Done | Use native `client.zpopmax(key, count?)` |
| `bzpopmin` | ✅ Done | Use native `client.bzpopmin(keys, timeout)` |
| `bzpopmax` | ✅ Done | Use native `client.bzpopmax(keys, timeout)` |
| `zinter` | ✅ Done | Use native `client.zinter(keys, options?)` |
| `zunion` | ✅ Done | Use native `client.zunion(keys, options?)` |
| `zintercard` | ✅ Done | Use native `client.zintercard(keys, limit?)` |
| `zmpop` | ✅ Done | Use native `client.zmpop(keys, modifier, count?)` |
| `bzmpop` | ✅ Done | Use native `client.bzmpop(keys, modifier, timeout, count?)` |

#### **Stream Commands**
| Command | Status | Migration Impact |
|---------|--------|------------------|
| `xadd` | ✅ Done | Use native `client.xadd(key, values, options?)` |
| `xread` | ✅ Done | Use native `client.xread(keysAndIds, options?)` |
| `xreadgroup` | ✅ Done | Use native `client.xreadgroup(group, consumer, keysAndIds, options?)` |
| `xack` | ✅ Done | Use native `client.xack(key, group, ids)` |
| `xlen` | ✅ Done | Use native `client.xlen(key)` |
| `xdel` | ✅ Done | Use native `client.xdel(key, ids)` |
| `xtrim` | ✅ Done | Use native `client.xtrim(key, options)` |
| `xrange` | ✅ Done | Use native `client.xrange(key, start, end, count?)` |
| `xrevrange` | ✅ Done | Use native `client.xrevrange(key, end, start, count?)` |

#### **Pub/Sub Commands**
| Command | Status | Migration Impact |
|---------|--------|------------------|
| `subscribe` | ✅ Done | **Special**: Connection-time configuration |
| `unsubscribe` | ✅ Done | **Special**: Connection-time configuration |
| `psubscribe` | ✅ Done | **Special**: Connection-time configuration |
| `punsubscribe` | ✅ Done | **Special**: Connection-time configuration |
| `publish` | ✅ Done | Use native `client.publish(channel, message)` |
| `pubsub` | ✅ Done | Use native `client.pubsubChannels()`, `client.pubsubNumsub()`, etc. |

#### **Script Commands**
| Command | Status | Migration Impact |
|---------|--------|------------------|
| `eval` | ✅ Done | **Special**: Use `client.invokeScript(Script, options)` |
| `evalsha` | ✅ Done | **Special**: Use Script class with caching |
| `script load` | ✅ Done | **Special**: Automatic via Script class |
| `script exists` | ✅ Done | **Special**: Automatic via Script class |
| `script flush` | ✅ Done | Use native `client.scriptFlush(mode?)` |
| `script kill` | ✅ Done | Use native `client.scriptKill()` |

#### **Transaction Commands**
| Command | Status | Migration Impact |
|---------|--------|------------------|
| `multi` | ✅ Done | Use native `client.multi()` or `Batch` |
| `exec` | ✅ Done | Use native `client.exec()` or `client.executeBatch()` |
| `discard` | ✅ Done | Use native `client.discard()` |
| `watch` | ✅ Done | Use native `client.watch(keys)` |
| `unwatch` | ✅ Done | Use native `client.unwatch()` |

#### **Configuration Commands**
| Command | Status | Migration Impact |
|---------|--------|------------------|
| `config get` | ✅ Done | Use native `client.configGet(parameters)` |
| `config set` | ✅ Done | Use native `client.configSet(parametersMap)` |
| `config rewrite` | ✅ Done | Use native `client.configRewrite()` |
| `config resetstat` | ✅ Done | Use native `client.configResetStat()` |

#### **Client Commands**
| Command | Status | Migration Impact |
|---------|--------|------------------|
| `client id` | ✅ Done | Use native `client.clientId()` |
| `client getname` | ✅ Done | Use native `client.clientGetName()` |
| `client setname` | ✅ Done | Use native `client.clientSetName(name)` |
| `client list` | ✅ Done | Use native `client.clientList(options?)` |
| `client info` | ✅ Done | Use native `client.clientInfo()` |

#### **Database Commands**
| Command | Status | Migration Impact |
|---------|--------|------------------|
| `flushdb` | ✅ Done | Use native `client.flushdb(mode?)` |
| `flushall` | ✅ Done | Use native `client.flushall(mode?)` |
| `dbsize` | ✅ Done | Use native `client.dbsize()` |
| `exists` | ✅ Done | Use native `client.exists(keys)` |
| `del` | ✅ Done | Use native `client.del(keys)` |
| `expire` | ✅ Done | Use native `client.expire(key, seconds, option?)` |
| `expireat` | ✅ Done | Use native `client.expireat(key, timestamp, option?)` |
| `pexpire` | ✅ Done | Use native `client.pexpire(key, milliseconds, option?)` |
| `pexpireat` | ✅ Done | Use native `client.pexpireat(key, timestamp, option?)` |
| `ttl` | ✅ Done | Use native `client.ttl(key)` |
| `pttl` | ✅ Done | Use native `client.pttl(key)` |
| `persist` | ✅ Done | Use native `client.persist(key)` |
| `type` | ✅ Done | Use native `client.type(key)` |
| `keys` | ✅ Done | Use native `client.keys(pattern)` |
| `scan` | ✅ Done | Use native `client.scan(cursor, options?)` |

## 🚨 **Commands Requiring Special Handling**

### **1. Pub/Sub Commands - Architecture Bridge Required**
Based on [GLIDE General Concepts - PubSub Support](https://github.com/valkey-io/valkey-glide/wiki/General-Concepts#pubsub-support):

**GLIDE Pub/Sub Model**:
- **Connection-time configuration** via `pubsubSubscriptions` in client config
- **Callback-based** message handling, not EventEmitter
- **Automatic reconnection** and resubscription handled by GLIDE
- **No dynamic subscribe/unsubscribe** methods during runtime

**Bridge Requirements**:
```typescript
// ioredis expects:
await redis.subscribe('channel');
redis.on('message', (channel, message) => { ... });

// GLIDE provides:
const config = {
  pubsubSubscriptions: {
    channelsAndPatterns: {
      [PubSubChannelModes.Exact]: new Set(['channel'])
    },
    callback: (msg, context) => { ... }
  }
};
```

### **2. Script Commands - Object Management Required**
**GLIDE Script Model**:
- Uses `Script` class objects instead of raw script strings
- Automatic SHA management and caching
- `invokeScript(script, options)` instead of `eval`/`evalsha`

**Bridge Requirements**:
```typescript
// ioredis expects:
await redis.eval(scriptString, numKeys, ...args);
await redis.evalsha(sha, numKeys, ...args);

// GLIDE provides:
const script = new Script(scriptString);
await client.invokeScript(script, { keys, args });
```

### **3. Deprecated Commands - Migration Required**
| Deprecated Command | Replacement | Action Required |
|-------------------|-------------|-----------------|
| `hmset` | `hset` | Update all usages |
| `brpoplpush` | `blmove` | Update Bull/BullMQ integration |

## 📊 **Migration Impact Analysis**

### **High Impact Migrations (Architectural Changes)**
1. **Pub/Sub Bridge** (10 commands) - Requires connection management and event translation
2. **Script Management** (6 commands) - Requires Script object caching and lifecycle management

### **Medium Impact Migrations (Parameter/Result Translation)**
1. **Stream Commands** (9 commands) - Requires parameter structure translation
2. **Utility Commands** (15 commands) - Requires result format translation

### **Low Impact Migrations (Direct Replacement)**
1. **Core Commands** (50+ commands) - Direct method replacement with minimal changes

## 🎯 **CustomCommand Reduction Potential**

Based on this analysis, we can achieve significant customCommand reduction:

| Command Category | Current customCommands | Native Available | Reduction Potential |
|------------------|------------------------|------------------|-------------------|
| **String Commands** | 4 | 4 | 100% (✅ Completed) |
| **Blocking Commands** | 6 | 5 | 83% (✅ Completed) |
| **ZSET Commands** | 2 | 2 | 100% (✅ Completed) |
| **Stream Commands** | 14 | 12 | 86% (🔄 In Progress) |
| **Pub/Sub Commands** | 10 | 10* | 100%* (*requires bridge) |
| **Script Commands** | 12 | 12* | 100%* (*requires bridge) |
| **Utility Commands** | 24 | 20+ | 80%+ |
| **List Commands** | 3 | 3 | 100% |
| **Hash Commands** | 2 | 2 | 100% |

**Total Potential**: 76 → ~10 customCommands (87% reduction achievable)

## 🚀 **Implementation Priority**

### **Phase 2.1: Pub/Sub Bridge** (Immediate)
- **Impact**: Critical for Bull/BullMQ compatibility
- **Complexity**: High - requires architectural redesign
- **Commands**: 10 → 0 customCommands

### **Phase 2.2: Script Management** (Next)
- **Impact**: Critical for Bull Lua scripts
- **Complexity**: Medium - requires object management
- **Commands**: 12 → 0 customCommands

### **Phase 2.3: Utility Commands** (Final)
- **Impact**: Performance and type safety
- **Complexity**: Low - mostly translation
- **Commands**: 24 → ~5 customCommands

This analysis confirms that GLIDE has excellent command coverage for Node.js, with native implementations available for nearly all Redis commands. The main challenges are architectural differences in pub/sub and script management patterns, not missing functionality.
