# ioredis Adapter Integration Test Plan

## 🎯 **Objective**
Validate that our ioredis adapter works with real-world libraries that depend on ioredis, ensuring seamless drop-in replacement capability.

## 📋 **Target Libraries & Use Cases**

### **1. BullMQ (Job Queue Processing)**
- **Library**: `bullmq` 
- **Use Case**: Background job processing, scheduling, rate limiting
- **ioredis Features Used**: Pipeline, Multi, Events, Pub/Sub
- **Test Scenarios**:
  - Job creation and processing
  - Job scheduling and delays
  - Rate limiting per queue
  - Job priorities and concurrency
  - Failed job retry logic

### **2. Express Rate Limiting**
- **Library**: `rate-limit-redis` with `express-rate-limit`
- **Use Case**: API rate limiting with Redis backend
- **ioredis Features Used**: Commands (INCR, EXPIRE), Pipeline
- **Test Scenarios**:
  - Per-IP rate limiting
  - Different time windows
  - Sliding vs fixed windows
  - Rate limit headers

### **3. Express Session Store**
- **Library**: `connect-redis`
- **Use Case**: Session storage for Express applications
- **ioredis Features Used**: GET/SET, TTL, Events
- **Test Scenarios**:
  - Session creation and retrieval
  - Session expiration
  - Session destruction
  - Concurrent session access

### **4. Socket.IO Redis Adapter**
- **Library**: `@socket.io/redis-adapter`
- **Use Case**: Multi-instance Socket.IO scaling
- **ioredis Features Used**: Pub/Sub, Events
- **Test Scenarios**:
  - Cross-instance message delivery
  - Room management
  - Namespace isolation

## 🧪 **Integration Test Structure**

```
tests/integration/
├── bullmq/
│   ├── basic-queue.test.ts
│   ├── rate-limiting.test.ts
│   ├── scheduling.test.ts
│   └── error-handling.test.ts
├── rate-limiting/
│   ├── express-rate-limit.test.ts
│   └── sliding-window.test.ts
├── session-store/
│   ├── connect-redis.test.ts
│   └── session-lifecycle.test.ts
├── socketio/
│   ├── redis-adapter.test.ts
│   └── multi-instance.test.ts
└── shared/
    ├── test-helpers.ts
    └── mock-apps.ts
```

## ⚙️ **Test Environment Requirements**

### **Dependencies to Add**:
```json
{
  "devDependencies": {
    "bullmq": "^5.0.0",
    "express": "^4.18.0",
    "express-rate-limit": "^7.0.0", 
    "rate-limit-redis": "^4.0.0",
    "connect-redis": "^7.0.0",
    "express-session": "^1.17.0",
    "socket.io": "^4.7.0",
    "@socket.io/redis-adapter": "^8.0.0",
    "supertest": "^6.3.0"
  }
}
```

### **Test Server Setup**:
- Use existing Docker Valkey setup
- Each test suite should use isolated keyspace (`TEST:bullmq:*`, `TEST:rate:*`, etc.)
- Cleanup between tests to prevent interference

## 🔍 **Validation Criteria**

### **Functional Compatibility**:
- ✅ Library initializes without errors
- ✅ All core functionality works identically
- ✅ Event handling works correctly
- ✅ Error handling matches expected behavior

### **Performance Baseline**:
- ✅ No significant performance degradation (<5% overhead)
- ✅ Memory usage comparable to native ioredis
- ✅ Connection handling remains efficient

### **Edge Cases**:
- ✅ Connection failures and reconnection
- ✅ Large payload handling
- ✅ High concurrency scenarios
- ✅ Graceful shutdown behavior

## 🚀 **Implementation Phases**

### **Phase 1: BullMQ Integration** (Priority 1)
Most common ioredis use case, tests core adapter functionality

### **Phase 2: Rate Limiting** (Priority 2) 
Tests command accuracy and performance characteristics

### **Phase 3: Session Store** (Priority 3)
Tests TTL handling and persistence features

### **Phase 4: Socket.IO** (Priority 4)
Tests Pub/Sub functionality and multi-connection scenarios

## 📊 **Success Metrics**

- **100% API Compatibility**: All target libraries work without modification
- **Performance Parity**: <5% performance difference vs native ioredis  
- **Test Coverage**: >95% of adapter code tested through integrations
- **Real-world Validation**: Successful deployment in production-like scenarios

## 🎯 **Next Actions**

1. **Install Integration Dependencies**
2. **Implement BullMQ Integration Tests**
3. **Fix any discovered adapter gaps**
4. **Expand to other libraries systematically**
5. **Document compatibility matrix**