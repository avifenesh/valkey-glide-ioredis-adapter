# Production Deployment Guide

This guide covers production deployment, error handling, logging, monitoring, and operational best practices for the ioredis-to-valkey-glide adapter.

## Production Checklist

### Pre-Deployment
- [ ] All tests passing (`npm test`, `npm run test:integration`)
- [ ] TypeScript compilation successful (`npm run build`)
- [ ] Security audit completed (`npm audit`)
- [ ] Load testing completed
- [ ] Monitoring and alerting configured

### Environment Configuration

```bash
# Environment Variables
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password
REDIS_TLS_ENABLED=false
REDIS_POOL_ENABLED=true
REDIS_POOL_MAX_CONNECTIONS=10
REDIS_CACHE_ENABLED=true
LOG_LEVEL=info
METRICS_ENABLED=true
```

### Production Configuration

```typescript
import { RedisAdapter } from '@your-org/ioredis-valkey-adapter';

const redis = new RedisAdapter({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  
  // TLS Configuration
  tls: process.env.REDIS_TLS_ENABLED === 'true' ? {
    cert: fs.readFileSync(process.env.REDIS_TLS_CERT_PATH!),
    key: fs.readFileSync(process.env.REDIS_TLS_KEY_PATH!),
    ca: fs.readFileSync(process.env.REDIS_TLS_CA_PATH!)
  } : undefined,
  
  // Connection Pooling
  pooling: {
    enablePooling: true,
    maxConnections: 10,
    minConnections: 2,
    idleTimeout: 300000
  },
  
  // Caching
  caching: {
    l1Size: 1000,
    l2Size: 5000,
    defaultTtl: 300000
  },
  
  // Retry Strategy
  retryStrategy: (times: number) => Math.min(times * 50, 2000),
  connectTimeout: 10000,
  commandTimeout: 5000
});
```

## Error Handling

### Connection Errors

```typescript
import { ConnectionError, TimeoutError } from '@your-org/ioredis-valkey-adapter';

try {
  await redis.set('key', 'value');
} catch (error) {
  if (error instanceof ConnectionError) {
    logger.error('Redis connection failed', {
      error: error.message,
      attempt: error.attempt
    });
    
    // Implement circuit breaker or fallback
    if (error.attempt > 3) {
      await fallbackStorage.set('key', 'value');
    }
  }
  
  if (error instanceof TimeoutError) {
    logger.warn('Redis command timeout', {
      command: 'SET',
      timeout: error.timeout
    });
    
    // Retry with longer timeout
    return await redis.set('key', 'value', 'EX', 300);
  }
}
```

### Global Error Handler

```typescript
// Global error handler
RedisAdapter.on('error', (error, context) => {
  logger.error('Redis error', {
    error: error.message,
    context,
    timestamp: new Date().toISOString()
  });
  
  // Send to error tracking
  errorTracker.captureException(error, {
    tags: { component: 'redis-adapter' },
    extra: context
  });
});

// Connection monitoring
RedisAdapter.on('connect', (connection) => {
  logger.info('Redis connected', { connectionId: connection.id });
  metrics.increment('redis.connections.established');
});

RedisAdapter.on('disconnect', (connection, reason) => {
  logger.warn('Redis disconnected', { reason });
  metrics.increment('redis.connections.lost');
});
```

## Logging

### Structured Logging

```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: '/var/log/app/redis-adapter.log',
      maxsize: 50 * 1024 * 1024,
      maxFiles: 10
    })
  ]
});
```

### Operation Logging

```typescript
// Command execution logging
redis.on('command', (command, args, startTime) => {
  const duration = Date.now() - startTime;
  
  if (duration > 1000) {
    logger.warn('Slow Redis command', {
      command,
      duration,
      threshold: 1000
    });
  }
});

// Pipeline logging
redis.on('pipeline:complete', (commands, duration, results) => {
  const errorCount = results.filter(([error]) => error).length;
  
  logger.info('Pipeline completed', {
    commandCount: commands.length,
    duration,
    errorCount
  });
});
```

## Monitoring

### Metrics Collection

```typescript
import { StatsD } from 'node-statsd';

const statsD = new StatsD({
  host: process.env.STATSD_HOST || 'localhost',
  prefix: 'redis_adapter.'
});

class RedisMetrics {
  recordCommand(command: string, duration: number, success: boolean) {
    statsD.timing(`command.${command}.duration`, duration);
    statsD.increment(`command.${command}.${success ? 'success' : 'error'}`);
  }

  recordPoolEvent(event: 'acquired' | 'released') {
    statsD.increment(`pool.${event}`);
  }

  recordCacheEvent(event: 'hit' | 'miss', level: 'l1' | 'l2') {
    statsD.increment(`cache.${level}.${event}`);
  }
}

export const redisMetrics = new RedisMetrics();
```

### Health Checks

```typescript
import { Express } from 'express';

export function setupHealthChecks(app: Express, redis: RedisAdapter) {
  app.get('/health', async (req, res) => {
    try {
      const start = Date.now();
      await redis.ping();
      const latency = Date.now() - start;
      
      res.json({
        status: 'healthy',
        checks: {
          redis: { status: 'up', latency: `${latency}ms` }
        }
      });
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        checks: {
          redis: { status: 'down', error: error.message }
        }
      });
    }
  });

  app.get('/metrics', (req, res) => {
    const stats = {
      pool: redis.getPoolStats(),
      cache: redis.getCacheStats(),
      performance: redis.getPerformanceReport()
    };
    res.json(stats);
  });
}
```

## Deployment

### Docker Configuration

```dockerfile
FROM node:18-alpine

RUN adduser -S redis-app
WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY --chown=redis-app:nodejs dist/ ./dist/
USER redis-app

HEALTHCHECK --interval=30s --timeout=10s \
  CMD curl -f http://localhost:3000/health || exit 1

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis-adapter-app
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: app
        image: your-registry/redis-adapter-app:latest
        env:
        - name: REDIS_HOST
          valueFrom:
            secretKeyRef:
              name: redis-secrets
              key: host
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
```

## Security

### TLS Configuration

```typescript
const tlsConfig = {
  cert: fs.readFileSync('/etc/ssl/certs/redis-client.crt'),
  key: fs.readFileSync('/etc/ssl/private/redis-client.key'),
  ca: fs.readFileSync('/etc/ssl/certs/redis-ca.crt'),
  rejectUnauthorized: true,
  minVersion: 'TLSv1.2'
};
```

### Data Encryption

```typescript
class SecureRedisAdapter extends RedisAdapter {
  private encryptionKey: Buffer;

  constructor(options: any) {
    super(options);
    this.encryptionKey = crypto.scryptSync(
      process.env.ENCRYPTION_PASSWORD!,
      process.env.ENCRYPTION_SALT!,
      32
    );
  }

  async setSecure(key: string, value: string): Promise<any> {
    const encrypted = this.encrypt(value);
    return super.set(key, encrypted);
  }

  async getSecure(key: string): Promise<string | null> {
    const encrypted = await super.get(key);
    return encrypted ? this.decrypt(encrypted) : null;
  }
}
```

## Performance Optimization

### Memory Management

```typescript
// Monitor memory usage
setInterval(() => {
  const usage = process.memoryUsage();
  
  if (usage.heapUsed > 500 * 1024 * 1024) { // 500MB
    logger.warn('High memory usage detected', {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal
    });
    
    // Trigger garbage collection if needed
    if (global.gc) {
      global.gc();
    }
  }
}, 60000);
```

### Connection Optimization

```typescript
// Optimize connection pooling
const redis = new RedisAdapter({
  pooling: {
    enablePooling: true,
    maxConnections: Math.min(20, os.cpus().length * 4),
    minConnections: 2,
    idleTimeout: 300000,
    healthCheckInterval: 30000
  }
});
```

## Troubleshooting

### Common Issues

1. **High Latency**
   - Check network connectivity
   - Monitor connection pool utilization
   - Review slow query logs

2. **Memory Leaks**
   - Monitor heap usage
   - Check for unhandled promises
   - Review cache eviction policies

3. **Connection Errors**
   - Verify Redis server status
   - Check network security groups
   - Review connection pool configuration

### Debug Mode

```typescript
// Enable debug logging
process.env.DEBUG_REDIS = 'true';
process.env.LOG_LEVEL = 'debug';

// Additional debug information
redis.on('command', (command, args, duration) => {
  console.log(`Redis command: ${command} (${duration}ms)`);
});
```

This production guide provides essential deployment, monitoring, and operational practices for running the ioredis-valkey-glide adapter in production environments.