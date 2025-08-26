# Production Deployment Guide

This guide covers production deployment, monitoring, and operational best practices for the ioredis adapter.

## Production Checklist

### Pre-Deployment
- [ ] All tests passing (`npm test`)
- [ ] TypeScript compilation successful (`npm run build`)
- [ ] Security audit completed (`npm audit`)
- [ ] Integration tests validated with your specific libraries
- [ ] Performance testing completed
- [ ] Monitoring configured

### Production Configuration

```typescript
import { RedisAdapter } from '@valkey/valkey-glide-ioredis-adapter';

const redis = new RedisAdapter({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  
  // Connection settings
  connectTimeout: 10000,
  commandTimeout: 5000,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  
  // Key prefix for multi-tenant environments
  keyPrefix: process.env.REDIS_KEY_PREFIX || 'app:',
});
```

## Error Handling

### Connection Management

```typescript
try {
  await redis.connect();
} catch (error) {
  console.error('Failed to connect to Redis:', error);
  // Implement fallback or circuit breaker
}

// Handle connection events
redis.on('error', (error) => {
  console.error('Redis error:', error);
});

redis.on('connect', () => {
  console.log('Redis connected');
});

redis.on('ready', () => {
  console.log('Redis ready for commands');
});
```

### Command Error Handling

```typescript
try {
  await redis.set('key', 'value');
} catch (error) {
  console.error('Redis command failed:', error);
  // Implement retry logic or fallback
}
```

## Monitoring

### Basic Health Checks

```typescript
// Health check endpoint
app.get('/health/redis', async (req, res) => {
  try {
    const start = Date.now();
    await redis.ping();
    const duration = Date.now() - start;
    
    res.json({
      status: 'healthy',
      latency: duration,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});
```

### Performance Monitoring

```typescript
// Simple command timing
const startTime = Date.now();
try {
  const result = await redis.get('key');
  const duration = Date.now() - startTime;
  
  if (duration > 1000) {
    console.warn(`Slow Redis command: GET took ${duration}ms`);
  }
} catch (error) {
  console.error('Redis command failed:', error);
}
```

## Best Practices

### Connection Management
- Use appropriate timeouts for your use case
- Implement proper error handling and retries
- Monitor connection health regularly
- Use key prefixes for multi-tenant applications

### Performance Optimization
- Use pipelines for bulk operations
- Monitor command execution times
- Use appropriate data structures
- Set TTLs where appropriate

### Security
- Use strong passwords
- Consider TLS for production
- Implement proper authentication
- Use key prefixes to isolate data

### Operational
- Monitor Redis server health
- Set up alerting for connection failures
- Regular backups of Redis data
- Capacity planning and scaling

## Common Issues

### Connection Problems
- Check network connectivity
- Verify Redis server is running
- Check authentication credentials
- Review firewall settings

### Performance Issues
- Monitor for slow commands
- Check Redis server resources
- Review client connection settings
- Optimize data structures and queries

### Memory Issues
- Monitor Redis memory usage
- Implement appropriate TTLs
- Use efficient data structures
- Consider data compression for large values

## Support

For production support:
- Check [GitHub Issues](https://github.com/valkey-io/valkey-glide/issues)
- Review [API Documentation](API.md)
- Join [GitHub Discussions](https://github.com/valkey-io/valkey-glide/discussions)
