# ioredis ⟷ GLIDE Parameter Translation

## Direct Parameter Mapping

| ioredis Option | Type | GLIDE Option | GLIDE Type | Notes |
|----------------|------|--------------|------------|--------|
| `host` | string | `addresses[0].host` | string | ✅ Direct mapping |
| `port` | number | `addresses[0].port` | number | ✅ Direct mapping |
| `username` | string | `credentials.username` | string | ✅ Direct mapping |
| `password` | string | `credentials.password` | string | ✅ Direct mapping |
| `db` | number | `databaseId` | number | ✅ Direct mapping (standalone only) |
| `clientName` | string | `clientName` | string | ✅ Direct mapping |
| `tls/useTLS` | boolean | `useTLS` | boolean | ✅ Direct mapping |
| `lazyConnect` | boolean | `lazyConnect` | boolean | ✅ **GLIDE supports this!** |
| `requestTimeout` | number | `requestTimeout` | number | ✅ Direct mapping |
| `commandTimeout` | number | `requestTimeout` | number | ⚠️ Maps to same GLIDE field |
| `readFrom` | string | `readFrom` | ReadFrom | ✅ Our extension |
| `clientAz` | string | `clientAz` | string | ✅ Our extension |

## Advanced Parameter Translation

| ioredis Option | Type | Default | GLIDE Translation | Logic |
|----------------|------|---------|-------------------|-------|
| `maxRetriesPerRequest` | number/null | 20 | `connectionBackoff.numberOfRetries` | Map retry count to backoff strategy |
| `connectTimeout` | number | 10000 | `advancedConfiguration.connectionTimeout` | **GLIDE has this!** |
| `retryDelayOnFailover` | number | 100 | `connectionBackoff.jitterPercent` | Convert delay to jitter % |
| `enableOfflineQueue` | boolean | true | `inflightRequestsLimit` | `false` → limit=0, `true` → limit=1000 |
| `keepAlive` | number | 0 | Built-in | **Always on in GLIDE** |
| `enableAutoPipelining` | boolean | false | Built-in | **GLIDE optimizes internally** |
| `enableReadyCheck` | boolean | true | Built-in | **GLIDE handles readiness** |
| `family` | number | 4 | Built-in | **GLIDE handles IP resolution** |

## GLIDE Advanced Configuration Options

| GLIDE Configuration | Type | Default | Description |
|---------------------|------|---------|-------------|
| `connectionBackoff.numberOfRetries` | number | 10 | Max retries before constant delay |
| `connectionBackoff.factor` | number | 500 | Base delay in milliseconds |
| `connectionBackoff.exponentBase` | number | 2 | Exponential growth factor |
| `connectionBackoff.jitterPercent` | number | 20 | Random jitter percentage |
| `connectionTimeout` | number | 2000 | TCP/TLS connection timeout (ms) |
| `inflightRequestsLimit` | number | 1000 | Max concurrent requests (queue size) |
| `protocol` | ProtocolVersion | RESP3 | RESP2 or RESP3 |
| `defaultDecoder` | Decoder | String | String or Bytes |

## Translation Implementation Examples

### maxRetriesPerRequest → connectionBackoff
```typescript
if (options.maxRetriesPerRequest !== undefined) {
  const retries = options.maxRetriesPerRequest === null ? 50 : options.maxRetriesPerRequest;
  config.connectionBackoff = {
    numberOfRetries: retries,
    factor: 500,                    // Base delay 500ms
    exponentBase: 2,               // Double each time
    jitterPercent: 20              // ±20% randomness
  };
}
```

### enableOfflineQueue → inflightRequestsLimit
```typescript
if (options.enableOfflineQueue === false) {
  config.inflightRequestsLimit = 0; // No queuing, immediate failure
} else {
  config.inflightRequestsLimit = 1000; // Default queue size
}
```

### retryDelayOnFailover → jitterPercent
```typescript
if (options.retryDelayOnFailover !== undefined) {
  // Convert delay (ms) to jitter percentage (0-100%)
  const jitter = Math.min(100, Math.max(5, Math.round(options.retryDelayOnFailover / 5)));
  config.connectionBackoff = {
    ...config.connectionBackoff,
    jitterPercent: jitter
  };
}
```

### connectTimeout → advancedConfiguration
```typescript
if (options.connectTimeout !== undefined) {
  config.advancedConfiguration = {
    connectionTimeout: options.connectTimeout
  };
}
```

## Key Differences: ioredis vs GLIDE

### Retry Strategy Evolution
- **ioredis**: Simple per-request retry counter (`maxRetriesPerRequest`)
- **GLIDE**: Sophisticated exponential backoff with jitter to prevent thundering herd

### Connection Management
- **ioredis**: Manual keep-alive, ready checks, connection timeouts
- **GLIDE**: Built-in connection management, always-on keep-alive, automatic readiness

### Queue Management  
- **ioredis**: Simple on/off offline queue (`enableOfflineQueue`)
- **GLIDE**: Advanced inflight request limiting with backpressure control

### Cluster Behavior
- **ioredis**: Manual failover delays (`retryDelayOnFailover`)
- **GLIDE**: Automatic cluster topology discovery with intelligent jitter

## Implementation Strategy

1. **Smart Translation**: Convert ioredis concepts to GLIDE equivalents
2. **Enhanced Defaults**: Use GLIDE's superior defaults while maintaining compatibility
3. **Silent Upgrades**: Built-in features (keepAlive, autoPipelining) work automatically
4. **Preserve Intent**: Maintain the user's intended behavior through proper mapping