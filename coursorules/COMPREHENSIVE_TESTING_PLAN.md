# Comprehensive Testing Plan for Cluster Support

## Overview
This document outlines a comprehensive testing strategy to validate that our ioredis-adapter cluster support works correctly with all major Redis-dependent libraries and frameworks.

## Phase 1: Core Build & Syntax Fixes ⚠️ URGENT

### Current Issues
- [ ] **CRITICAL**: Fix syntax error in `src/adapters/RedisAdapter.ts:1892` preventing build
- [ ] Resolve TypeScript compilation errors
- [ ] Ensure all new cluster files compile correctly

### Actions Required
1. Fix the defineCommand method structure in RedisAdapter.ts
2. Resolve all TypeScript linting errors
3. Verify clean build with `npm run build`
4. Run existing tests to ensure no regressions

## Phase 2: Test Suite Acquisition & Analysis

### 2.1 ioredis Core Tests
**Repository**: https://github.com/redis/ioredis
**Priority**: HIGH
**Focus Areas**:
- [ ] Copy cluster-specific tests from ioredis repository
- [ ] Adapt tests for our adapter interface
- [ ] Validate basic cluster operations (GET, SET, MGET, MSET)
- [ ] Test cluster topology discovery and failover
- [ ] Validate pub/sub across cluster nodes

**Files to Examine**:
```bash
/test/functional/cluster.ts
/test/functional/cluster-nat-map.ts  
/test/functional/cluster-failover.ts
/test/unit/cluster.ts
```

### 2.2 Bull/BullMQ Integration Tests
**Repositories**: 
- https://github.com/OptimalBits/bull
- https://github.com/taskforcesh/bullmq
- https://github.com/restuwahyu13/queue-redis-cluster

**Priority**: HIGH
**Focus Areas**:
- [ ] Copy Bull cluster compatibility tests
- [ ] Test job creation, processing, and completion in cluster mode
- [ ] Validate delayed jobs with cluster
- [ ] Test job retry mechanisms
- [ ] Validate Bull's `createClient` factory method with cluster
- [ ] Test BullMQ Lua script execution across cluster

**Key Test Scenarios**:
```typescript
// Test Bull with cluster
const queue = new Queue('test', {
  createClient: (type) => ClusterAdapter.createClient(type, clusterConfig)
});

// Test job processing across cluster nodes
// Test delayed jobs with cluster topology changes
// Test job retry with node failures
```

### 2.3 Socket.IO Redis Adapter Tests
**Repository**: https://github.com/socketio/socket.io-redis-adapter
**Priority**: MEDIUM
**Focus Areas**:
- [ ] Copy Socket.IO adapter tests
- [ ] Test real-time message broadcasting across cluster
- [ ] Validate room management in cluster mode
- [ ] Test adapter with multiple Socket.IO server instances

**Key Test Scenarios**:
```typescript
// Test Socket.IO with cluster adapter
const io = new Server(server, {
  adapter: createAdapter(clusterClient, clusterSubClient)
});
```

### 2.4 Express Session Store Tests  
**Repository**: https://github.com/tj/connect-redis
**Priority**: MEDIUM
**Focus Areas**:
- [ ] Copy connect-redis session store tests
- [ ] Test session creation, retrieval, and expiration
- [ ] Validate session persistence across cluster nodes
- [ ] Test TTL handling in cluster mode

**Key Test Scenarios**:
```typescript
// Test express-session with cluster
app.use(session({
  store: new RedisStore({ client: clusterAdapter }),
  // ... other options
}));
```

### 2.5 Rate Limiting Tests
**Repository**: https://github.com/express-rate-limit/rate-limit-redis
**Priority**: MEDIUM  
**Focus Areas**:
- [ ] Copy rate-limit-redis tests
- [ ] Test rate limiting with cluster key distribution
- [ ] Validate INCR/PTTL operations in cluster mode
- [ ] Test rate limit reset and cleanup

**Key Test Scenarios**:
```typescript
// Test rate limiting with cluster
const limiter = rateLimit({
  store: new RedisStore({
    client: clusterAdapter,
    prefix: 'rl:'
  })
});
```

## Phase 3: Cluster-Specific Test Development

### 3.1 Cluster Topology Tests
- [ ] Test automatic node discovery
- [ ] Test slot mapping and key routing
- [ ] Test MOVED/ASK redirection handling
- [ ] Test cluster topology updates
- [ ] Test node failure and recovery scenarios

### 3.2 Cross-Slot Operation Tests
- [ ] Test multi-key operations that span slots
- [ ] Test pipeline operations in cluster mode
- [ ] Test transaction (MULTI/EXEC) limitations
- [ ] Test Lua script execution with multiple keys

### 3.3 Performance & Load Tests
- [ ] Benchmark cluster vs single-node performance
- [ ] Test connection pooling efficiency
- [ ] Test memory usage under load
- [ ] Test concurrent operation handling

## Phase 4: Integration Test Matrix

### 4.1 Library Compatibility Matrix
Create comprehensive test matrix covering:

| Library | Single Node | Cluster | Status |
|---------|-------------|---------|--------|
| Bull v3 | ✅ | ❓ | Testing Required |
| Bull v4 | ✅ | ❓ | Testing Required |  
| BullMQ | ✅ | ❓ | Testing Required |
| Socket.IO Adapter | ✅ | ❓ | Testing Required |
| connect-redis | ✅ | ❓ | Testing Required |
| rate-limit-redis | ✅ | ❓ | Testing Required |
| ioredis-mock | ✅ | ❓ | Testing Required |

### 4.2 Test Environment Setup
- [ ] Set up Redis cluster test environment (3 masters, 3 replicas)
- [ ] Create Docker Compose for cluster testing
- [ ] Set up CI/CD pipeline for cluster tests
- [ ] Create test data fixtures for each library

## Phase 5: Test Implementation Strategy

### 5.1 Test Structure
```
tests/
├── cluster/
│   ├── core/                 # Basic cluster operations
│   ├── integrations/         # Library-specific tests
│   │   ├── bull/
│   │   ├── bullmq/
│   │   ├── socketio/
│   │   ├── express-session/
│   │   └── rate-limit/
│   ├── performance/          # Load and performance tests
│   └── failover/            # Failure scenario tests
└── fixtures/                # Test data and configurations
```

### 5.2 Test Categories

#### Unit Tests
- [ ] ClusterAdapter method functionality
- [ ] ClusterStringCommands operations
- [ ] BaseClusterAdapter connection management
- [ ] Error handling and edge cases

#### Integration Tests  
- [ ] Library-specific compatibility tests
- [ ] Cross-library interaction tests
- [ ] Real Redis cluster integration tests

#### End-to-End Tests
- [ ] Complete application scenarios
- [ ] Multi-service cluster scenarios
- [ ] Production-like load tests

## Phase 6: Test Execution Plan

### 6.1 Immediate Actions (Week 1)
1. **Fix build issues** - CRITICAL BLOCKER
2. Copy and adapt ioredis cluster tests
3. Set up basic cluster test environment
4. Implement core cluster operation tests

### 6.2 Library Integration (Week 2)
1. Bull/BullMQ integration tests
2. Socket.IO adapter tests  
3. Express session store tests
4. Rate limiting tests

### 6.3 Advanced Testing (Week 3)
1. Failover and recovery tests
2. Performance benchmarking
3. Load testing
4. Memory usage analysis

### 6.4 Validation & Documentation (Week 4)
1. Complete test matrix validation
2. Performance comparison documentation
3. Migration guide updates
4. CI/CD pipeline completion

## Phase 7: Success Criteria

### 7.1 Functional Requirements
- [ ] 100% pass rate on adapted ioredis cluster tests
- [ ] 100% pass rate on Bull/BullMQ cluster tests
- [ ] 100% pass rate on Socket.IO adapter tests
- [ ] 100% pass rate on session store tests
- [ ] 100% pass rate on rate limiting tests

### 7.2 Performance Requirements
- [ ] Cluster performance within 10% of ioredis cluster
- [ ] Memory usage within 20% of single-node adapter
- [ ] Connection efficiency meets or exceeds ioredis
- [ ] Failover time under 1 second

### 7.3 Reliability Requirements
- [ ] Zero data loss during node failures
- [ ] Automatic recovery from network partitions
- [ ] Consistent behavior across all supported libraries
- [ ] Proper error handling and reporting

## Phase 8: Risk Mitigation

### 8.1 Identified Risks
1. **Build Issues**: Current syntax errors blocking progress
2. **API Incompatibilities**: GLIDE cluster API differences
3. **Performance Degradation**: Cluster overhead impact
4. **Library Dependencies**: Breaking changes in dependencies

### 8.2 Mitigation Strategies
1. **Immediate Build Fix**: Priority #1 - fix syntax errors
2. **Gradual Implementation**: Test one library at a time
3. **Performance Monitoring**: Continuous benchmarking
4. **Version Pinning**: Lock dependency versions during testing

## Next Steps

1. **IMMEDIATE**: Fix build syntax error in RedisAdapter.ts
2. **TODAY**: Set up cluster test environment
3. **THIS WEEK**: Copy and adapt ioredis cluster tests
4. **NEXT WEEK**: Begin library integration testing

## Research Sources

- ioredis: https://github.com/redis/ioredis
- Bull: https://github.com/OptimalBits/bull  
- BullMQ: https://github.com/taskforcesh/bullmq
- Socket.IO Redis Adapter: https://github.com/socketio/socket.io-redis-adapter
- connect-redis: https://github.com/tj/connect-redis
- rate-limit-redis: https://github.com/express-rate-limit/rate-limit-redis
- Redis Cluster Examples: https://github.com/restuwahyu13/queue-redis-cluster
