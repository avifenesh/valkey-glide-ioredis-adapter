# Implementation Roadmap: GLIDE Native API Migration

## Overview
Transform the ioredis-adapter from a command proxy to a proper translation layer, reducing customCommand usage from 76 to ~10 (87% reduction) while maintaining 100% ioredis API compatibility.

## Phase 1: Critical Fixes (Current Session - 2-3 hours)

### 1.1 Fix Remaining ZSET Issues (30 minutes)
**Goal**: Achieve 100% ZSET test pass rate

**Tasks**:
- [ ] **Fix `zrevrangebyscore` parameter order issue**
  - **Problem**: Returning empty array instead of results
  - **Root Cause**: Incorrect range query construction for reverse order
  - **Solution**: Ensure `start=min, end=max` regardless of reverse flag
  - **Files**: `src/adapters/RedisAdapter.ts` (lines ~1182-1240)
  - **Test**: `npm test -- --testNamePattern="zrevrangebyscore"`
  - **Success Criteria**: Test passes, returns `['three', 'two', 'one']`

- [ ] **Validate all ZSET fixes**
  - **Test**: `npm test -- tests/unit/enhanced-features.test.ts`
  - **Success Criteria**: All ZSET tests pass (6/6)

### 1.2 Migrate Stream Commands (45 minutes)
**Goal**: Replace 14 customCommands with 5, improve Bull integration

**Priority Order**:
1. **XADD** (HIGH) - Core job creation
2. **XREAD** (HIGH) - Job consumption  
3. **XACK** (HIGH) - Job acknowledgment
4. **XREADGROUP** (MEDIUM) - Consumer groups
5. Keep customCommand: XGROUP, XPENDING, XCLAIM (complex, low usage)

**Implementation**:
```typescript
// Before (customCommand)
await client.customCommand(['XADD', key, id, ...fields]);

// After (native GLIDE)
const fieldsArray: [string, string][] = [];
for (let i = 0; i < fields.length; i += 2) {
  fieldsArray.push([fields[i], fields[i + 1]]);
}
await client.xadd(key, fieldsArray, { id });
```

**Files to Update**:
- `src/adapters/RedisAdapter.ts` (lines ~190-200)
- `src/adapters/ModularRedisAdapter.ts` (lines ~395-430)
- `src/adapters/ClusterAdapter.ts` (lines ~395-430)

**Tests**: 
- `npm test -- --testNamePattern="stream|xadd|xread"`
- Bull integration tests

### 1.3 Create Result Translation Utilities (30 minutes)
**Goal**: Centralize GLIDE→ioredis result translation

**Create**: `src/utils/ResultTranslator.ts`
```typescript
export class ResultTranslator {
  static flattenSortedSetData(glideResult: SortedSetDataType): string[] {
    const flatArray: string[] = [];
    for (const item of glideResult) {
      flatArray.push(
        ParameterTranslator.convertGlideString(item.element) || '',
        item.score.toString()
      );
    }
    return flatArray;
  }
  
  static formatStreamEntries(glideResult: StreamEntry[]): any[] {
    // Convert GLIDE stream format to ioredis format
  }
}
```

**Refactor**: Update all ZSET methods to use centralized translation

### 1.4 Update Documentation (15 minutes)
**Goal**: Track progress and update migration status

**Tasks**:
- [ ] Update `GLIDE_API_MAPPING.md` with completed migrations
- [ ] Update `CURRENT_STATUS.md` with Phase 1 results
- [ ] Document new `ResultTranslator` utility

## Phase 2: Architecture Redesign (Next Session - 3-4 hours)

### 2.1 Pub/Sub Architecture Redesign (2 hours)
**Goal**: Replace 10 customCommands with native GLIDE callback pattern

**Current Problem**:
```typescript
// Wrong: Command-based approach
client.customCommand(['SUBSCRIBE', channel]);
client.on('message', callback);
```

**GLIDE Solution**:
```typescript
// Correct: Callback-based approach
const config = {
  pubsubSubscriptions: {
    channelsAndPatterns: {
      [PubSubChannelModes.Exact]: new Set([channel])
    },
    callback: (msg, context) => {
      // Bridge to ioredis events
      this.emit('message', msg.channel, msg.payload);
    }
  }
};
```

**Implementation Plan**:
1. **Create PubSubBridge class** (30 min)
2. **Implement subscription management** (45 min)
3. **Add event emulation layer** (30 min)
4. **Test with Bull integration** (15 min)

### 2.2 Script Management Migration (1 hour)
**Goal**: Replace 12 customCommands with GLIDE Script class

**Current Problem**:
```typescript
// Wrong: Manual script management
await client.customCommand(['SCRIPT', 'LOAD', script]);
await client.customCommand(['EVAL', script, ...args]);
```

**GLIDE Solution**:
```typescript
// Correct: GLIDE Script class
const script = new Script(scriptCode);
await script.invoke(client, { keys, args });
```

**Implementation**:
1. **Create ScriptManager class** (30 min)
2. **Migrate EVAL/EVALSHA methods** (20 min)
3. **Update Bull Lua script handling** (10 min)

### 2.3 Utility Commands Migration (1 hour)
**Goal**: Migrate INFO, CLIENT, KEYS commands to native methods

**Research Tasks**:
- [ ] Check GLIDE API for native INFO support
- [ ] Check GLIDE API for native CLIENT support  
- [ ] Check GLIDE API for native KEYS support
- [ ] Implement native methods or document why customCommand needed

## Phase 3: Performance & Polish (Future Session - 2 hours)

### 3.1 Performance Validation (45 minutes)
**Goal**: Validate native methods vs customCommand performance

**Benchmarks**:
- ZSET operations (native vs custom)
- Stream operations (native vs custom)
- Bulk operations performance
- Memory usage comparison

### 3.2 Code Cleanup (30 minutes)
**Goal**: Remove fallback implementations and dead code

**Tasks**:
- Remove try/catch fallbacks in ZSET methods
- Clean up unused imports
- Remove deprecated methods
- Update TypeScript interfaces

### 3.3 Documentation Completion (45 minutes)
**Goal**: Complete architectural documentation

**Deliverables**:
- Migration guide for users
- Performance comparison report
- Best practices guide
- API compatibility matrix

## Success Metrics & Validation

### Phase 1 Success Criteria
- [ ] **Test Pass Rate**: 98%+ (currently 95.3%)
- [ ] **ZSET Tests**: 6/6 passing (currently 4/6)
- [ ] **Stream Commands**: 14→5 customCommands
- [ ] **Build**: Zero compilation errors
- [ ] **Bull Integration**: Core functionality working

### Phase 2 Success Criteria  
- [ ] **CustomCommand Reduction**: 76→15 (80% reduction)
- [ ] **Pub/Sub**: Event-based architecture working
- [ ] **Scripts**: GLIDE Script class integrated
- [ ] **Performance**: Native methods 20%+ faster

### Phase 3 Success Criteria
- [ ] **Final Reduction**: 76→10 customCommands (87% reduction)
- [ ] **Test Coverage**: 99%+ pass rate
- [ ] **Documentation**: Complete migration guide
- [ ] **Performance**: Benchmarked and validated

## Risk Mitigation

### High Risk Items
1. **Pub/Sub Redesign**: Complex architecture change
   - **Mitigation**: Incremental implementation, extensive testing
2. **Bull Integration**: Critical for production use
   - **Mitigation**: Dedicated Bull test suite, real-world scenarios
3. **Performance Regression**: Native methods must be faster
   - **Mitigation**: Benchmark before/after, rollback plan

### Medium Risk Items
1. **API Compatibility**: Must maintain 100% ioredis compatibility
   - **Mitigation**: Comprehensive test suite, compatibility matrix
2. **Error Handling**: GLIDE errors vs ioredis errors
   - **Mitigation**: Error translation layer, consistent error formats

## Implementation Order Rationale

### Why ZSET First?
- **High Impact**: Affects queue systems (Bull/BullMQ)
- **Low Risk**: Simple result translation
- **Quick Win**: Visible test improvements

### Why Streams Second?
- **High Impact**: Core Bull functionality
- **Medium Risk**: Parameter translation complexity
- **Bull Critical**: Required for job processing

### Why Pub/Sub Third?
- **High Impact**: Real-time features
- **High Risk**: Architecture redesign
- **Complex**: Callback→event bridge

### Why Scripts Fourth?
- **Medium Impact**: Lua compatibility
- **Low Risk**: GLIDE has native Script class
- **Bull Dependent**: Required for advanced Bull features

## Monitoring & Validation

### Continuous Validation
- [ ] **After each fix**: Run relevant test suite
- [ ] **After each phase**: Full test suite (`npm test`)
- [ ] **Before commit**: Build validation (`npm run build`)

### Progress Tracking
- [ ] **CustomCommand count**: Track reduction progress
- [ ] **Test pass rate**: Monitor improvements
- [ ] **Performance metrics**: Benchmark key operations
- [ ] **Bull integration**: Validate real-world scenarios

## Next Actions (Immediate)

### 🔥 Start Now (Next 30 minutes)
1. **Fix zrevrangebyscore**: Debug parameter order issue
2. **Create ResultTranslator**: Centralize result translation
3. **Update documentation**: Track Phase 1 progress

### 🚀 Then Continue (Next 2 hours)  
1. **Migrate XADD/XREAD/XACK**: Replace stream customCommands
2. **Validate Bull integration**: Test job processing
3. **Prepare Phase 2**: Plan Pub/Sub redesign

---

**Time Estimate**: Phase 1 (2-3 hours) → 98% test pass rate, major architectural improvements
**Success Metric**: From command proxy to translation layer architecture
