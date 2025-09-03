# Testing Valkey JSON Module

This document explains how to test the JSON functionality using **valkey-bundle** instead of Redis Stack.

## 🚀 Quick Start with Valkey Bundle

### 1. Start Valkey Bundle Container

```bash
# Start valkey-bundle with all modules loaded
docker-compose -f docker-compose.valkey-bundle.yml up -d

# Check if it's ready
docker-compose -f docker-compose.valkey-bundle.yml ps
```

### 2. Run JSON Tests

```bash
# Test JSON operations (ValkeyJSON / RedisJSON v2 compatible)
npm test tests/unit/json-commands.test.ts

# Or run with verbose output
npm test tests/unit/json-commands.test.ts -- --verbose
```


### 4. Clean Up

```bash
# Stop and remove containers
docker-compose -f docker-compose.valkey-bundle.yml down

# Remove volumes (optional)
docker-compose -f docker-compose.valkey-bundle.yml down -v
```

## 📋 What's Included

### Valkey Bundle Modules

The `valkey/valkey-bundle` container includes:

- **📄 Valkey JSON**: Native JSON document storage and querying
- **🔍 Valkey Search**: Full-text search and vector similarity search
- **🎯 Valkey Bloom**: Probabilistic data structures (Bloom filters)
- **🔐 Valkey LDAP**: Authentication against LDAP providers

### Test Coverage

#### JSON Commands (18 Methods)
- ✅ `jsonSet()` - Store JSON documents
- ✅ `jsonGet()` - Retrieve with JSONPath queries  
- ✅ `jsonDel()` - Delete paths from documents
- ✅ `jsonType()` - Get data types
- ✅ `jsonNumIncrBy()` / `jsonNumMultBy()` - Numeric operations
- ✅ `jsonStrAppend()` / `jsonStrLen()` - String operations
- ✅ `jsonArrAppend()` / `jsonArrInsert()` / `jsonArrLen()` - Array operations
- ✅ `jsonObjKeys()` / `jsonObjLen()` - Object operations
- ✅ `jsonToggle()` / `jsonClear()` - Advanced operations


## 🔧 Configuration

### Environment Variables

```bash
# Valkey Bundle connection
export VALKEY_BUNDLE_HOST=localhost
export VALKEY_BUNDLE_PORT=6379

# Enable specific modules (optional)
export VALKEY_MODULES=json,bloom
```

### Test Configuration

The tests automatically detect available modules:

```typescript
// Test will skip if modules not available
const modules = await checkAvailableModules(redis);
if (!modules.json) {
  console.warn('⚠️  JSON module not available - skipping tests');
  return;
}
```

## 📊 Real-World Test Scenarios

### E-commerce Product Catalog (JSON)

```typescript
// Store product with complex nested structure
await redis.jsonSet('product:123', '$', {
  name: 'Gaming Laptop',
  specs: {
    cpu: 'Intel i7',
    gpu: 'NVIDIA RTX 3070',
    ram: '16GB'
  },
  tags: ['gaming', 'laptop', 'high-performance'],
  reviews: [
    { user: 'user1', rating: 5, comment: 'Excellent!' },
    { user: 'user2', rating: 4, comment: 'Great performance' }
  ]
});

// Query specific paths
const cpu = await redis.jsonGet('product:123', '$.specs.cpu');
const reviews = await redis.jsonGet('product:123', '$.reviews[*].rating');
```


## 🚨 Troubleshooting

### Module Not Available

If tests show "module not available":

```bash
# Check if valkey-bundle is running
docker ps | grep valkey-bundle

# Check logs for module loading
docker logs valkey-bundle-test

# Verify modules are loaded
docker exec valkey-bundle-test valkey-cli MODULE LIST
```

### Connection Issues

```bash
# Test direct connection
docker exec valkey-bundle-test valkey-cli ping

# Check port binding
netstat -tulpn | grep 6379
```

### Test Failures

```bash
# Run with debug output
DEBUG=* npm test tests/unit/json-commands.test.ts

# Run specific test
npm test -- --testNamePattern="should set and get simple JSON documents"
```

## 📚 Additional Resources

- [Valkey Bundle Documentation](https://valkey.io/topics/valkey-bundle/)
- [Valkey JSON Commands](https://github.com/valkey-io/valkey-json)
- [ValkeyJSON API Reference](https://github.com/valkey-io/valkey-rfc/blob/main/ValkeyJSON.md)

## 🎯 Integration Examples

### Bull Job Queue with JSON

```typescript
// Store complex job data as JSON
await redis.jsonSet('job:123', '$', {
  id: 123,
  type: 'video_processing',
  data: { 
    input_file: 'video.mp4',
    output_formats: ['720p', '1080p', '4K'],
    filters: ['denoise', 'sharpen'] 
  },
  progress: 0,
  created_at: new Date().toISOString()
});

// Update job progress
await redis.jsonNumIncrBy('job:123', '$.progress', 10);
```

### Session Store with JSON

```typescript
// Store user session as JSON document
await redis.jsonSet('session:abc123', '$', {
  user_id: 'user456',
  login_time: new Date().toISOString(),
  permissions: ['read', 'write', 'admin'],
  preferences: {
    theme: 'dark',
    language: 'en'
  }
});

// Update preferences without replacing entire session
await redis.jsonSet('session:abc123', '$.preferences.theme', 'light');
```

This approach gives you **Redis Stack functionality** using open-source Valkey modules, perfect for development and testing!