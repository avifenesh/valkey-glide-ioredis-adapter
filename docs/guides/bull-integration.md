# Bull Integration Guide

Complete guide for integrating Bull job queues with Valkey GLIDE ioredis Adapter.

## 🚀 Quick Start

### Installation
```bash
npm install bull valkey-glide-ioredis-adapter
```

### Basic Setup
```typescript
import Queue from 'bull';
import { RedisAdapter } from 'valkey-glide-ioredis-adapter';

// Create Bull queue with GLIDE adapter
const myQueue = new Queue('video processing', {
  createClient: (type: 'client' | 'subscriber' | 'bclient') => {
    return new RedisAdapter({
      host: 'localhost',
      port: 6379,
      // CRITICAL: All Bull clients need immediate connection
      lazyConnect: false,
      // Set maxRetriesPerRequest to null for bclient and subscriber  
      maxRetriesPerRequest: type === 'client' ? 3 : null
    });
  }
});
```

## 🔧 Configuration

### Valkey Connection Options
```typescript
const queueOptions = {
  createClient: (type: 'client' | 'subscriber' | 'bclient') => {
    const baseConfig = {
      host: process.env.VALKEY_HOST || 'localhost',
      port: parseInt(process.env.VALKEY_PORT || '6379'),
      password: process.env.VALKEY_PASSWORD,
      db: parseInt(process.env.VALKEY_DB || '0'),
      keyPrefix: 'bull:myapp:',
      lazyConnect: false, // REQUIRED for Bull compatibility
    };

    // Bull-specific client configuration
    if (type === 'bclient' || type === 'subscriber') {
      return new RedisAdapter({
        ...baseConfig,
        maxRetriesPerRequest: null, // Required for blocking operations
      });
    }

    return new RedisAdapter({
      ...baseConfig,
      maxRetriesPerRequest: 3,
    });
  }
};
```

### Queue Configuration
```typescript
const myQueue = new Queue('my-queue', queueOptions);

// Job processing
myQueue.process('video-encode', 5, async (job) => {
  const { videoFile, options } = job.data;
  
  // Update progress
  job.progress(10);
  
  // Process video...
  const result = await encodeVideo(videoFile, options);
  
  job.progress(100);
  return result;
});

// Event listeners
myQueue.on('completed', (job, result) => {
  console.log(`Job ${job.id} completed with result:`, result);
});

myQueue.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed:`, err.message);
});

myQueue.on('stalled', (job) => {
  console.warn(`Job ${job.id} stalled`);
});
```

## 📋 Job Operations

### Adding Jobs
```typescript
// Simple job
await myQueue.add({ video: 'input.mp4' });

// Job with options
await myQueue.add('video-encode', 
  { video: 'input.mp4', quality: 'high' },
  {
    delay: 60000,     // Delay 1 minute
    attempts: 3,      // Retry up to 3 times
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: 10,  // Keep last 10 completed jobs
    removeOnFail: 5,       // Keep last 5 failed jobs
  }
);

// Bulk jobs
const jobs = [
  { name: 'encode', data: { video: 'video1.mp4' } },
  { name: 'encode', data: { video: 'video2.mp4' } },
  { name: 'encode', data: { video: 'video3.mp4' } }
];

await myQueue.addBulk(jobs);
```

### Job Priorities
```typescript
// High priority job (lower number = higher priority)
await myQueue.add('urgent-task', { data: 'important' }, { priority: 1 });

// Normal priority job
await myQueue.add('normal-task', { data: 'normal' }, { priority: 10 });

// Low priority job
await myQueue.add('background-task', { data: 'bulk' }, { priority: 100 });
```

### Delayed Jobs
```typescript
// Delay by milliseconds
await myQueue.add('reminder', { message: 'Meeting in 1 hour' }, {
  delay: 60 * 60 * 1000 // 1 hour
});

// Schedule for specific time
const scheduledTime = new Date('2024-01-01T10:00:00Z');
await myQueue.add('scheduled-report', { type: 'monthly' }, {
  delay: scheduledTime.getTime() - Date.now()
});
```

## 🔄 Job Processing Patterns

### Multiple Job Types
```typescript
// Process different job types
myQueue.process('email', async (job) => {
  const { to, subject, body } = job.data;
  return await sendEmail(to, subject, body);
});

myQueue.process('image-resize', async (job) => {
  const { imagePath, width, height } = job.data;
  return await resizeImage(imagePath, width, height);
});

myQueue.process('data-export', async (job) => {
  const { query, format } = job.data;
  return await exportData(query, format);
});
```

### Concurrency Control
```typescript
// Process up to 5 jobs concurrently
myQueue.process('cpu-intensive', 5, async (job) => {
  // CPU-intensive work
  return await heavyComputation(job.data);
});

// Process one job at a time
myQueue.process('file-operation', 1, async (job) => {
  // File operations that shouldn't run concurrently
  return await processFile(job.data.filePath);
});
```

### Progress Tracking
```typescript
myQueue.process('long-task', async (job) => {
  const steps = job.data.steps;
  
  for (let i = 0; i < steps.length; i++) {
    await processStep(steps[i]);
    
    // Update progress percentage
    const progress = Math.round(((i + 1) / steps.length) * 100);
    await job.progress(progress);
  }
  
  return 'Task completed';
});

// Monitor progress
myQueue.on('progress', (job, progress) => {
  console.log(`Job ${job.id} is ${progress}% complete`);
});
```

## 📊 Queue Management

### Queue Statistics
```typescript
// Get queue statistics
const waiting = await myQueue.getWaiting();
const active = await myQueue.getActive();
const completed = await myQueue.getCompleted();
const failed = await myQueue.getFailed();
const delayed = await myQueue.getDelayed();

console.log({
  waiting: waiting.length,
  active: active.length,
  completed: completed.length,
  failed: failed.length,
  delayed: delayed.length
});
```

### Queue Cleanup
```typescript
// Clean completed jobs older than 1 hour
await myQueue.clean(60 * 60 * 1000, 'completed');

// Clean failed jobs older than 1 day
await myQueue.clean(24 * 60 * 60 * 1000, 'failed');

// Remove specific jobs
await myQueue.removeJobs('*'); // Remove all jobs
await myQueue.removeJobs('completed'); // Remove completed jobs
```

### Pause and Resume
```typescript
// Pause queue processing
await myQueue.pause(true); // Wait for active jobs to complete

// Resume queue processing
await myQueue.resume();

// Check if paused
const isPaused = await myQueue.isPaused();
```

## 🚨 Error Handling

### Job Retry Logic
```typescript
myQueue.process('unreliable-task', async (job) => {
  try {
    return await unreliableExternalAPI(job.data);
  } catch (error) {
    console.error(`Job ${job.id} attempt ${job.attemptsMade + 1} failed:`, error.message);
    
    // Let Bull handle retries based on job options
    throw error;
  }
});

// Add job with retry configuration
await myQueue.add('unreliable-task', { data: 'test' }, {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 1000,
  }
});
```

### Global Error Handling
```typescript
myQueue.on('error', (error) => {
  console.error('Queue error:', error);
});

myQueue.on('failed', (job, error) => {
  console.error(`Job ${job.id} failed after ${job.attemptsMade} attempts:`, error.message);
  
  // Handle permanent failure
  if (job.attemptsMade >= job.opts.attempts) {
    console.error(`Job ${job.id} permanently failed, sending notification`);
    // Send alert, log to monitoring system, etc.
  }
});
```

## ⚡ Performance Optimization

### Connection Pooling
```typescript
// Reuse Valkey connections across multiple queues
const redisConfig = {
  host: 'localhost',
  port: 6379,
  lazyConnect: false,
  maxRetriesPerRequest: null
};

const createClient = (type: 'client' | 'subscriber' | 'bclient') => {
  return new RedisAdapter({
    ...redisConfig,
    maxRetriesPerRequest: type === 'client' ? 3 : null
  });
};

// Multiple queues sharing connection factory
const emailQueue = new Queue('email', { createClient });
const imageQueue = new Queue('images', { createClient });
const reportQueue = new Queue('reports', { createClient });
```

### Job Optimization
```typescript
// Efficient job data structure
await myQueue.add('process-user', {
  userId: 123,           // Reference, not full object
  operation: 'update',   // Simple operation type
  timestamp: Date.now()  // Minimal metadata
});

// Avoid large payloads - use references
await myQueue.add('process-large-file', {
  fileId: 'abc123',        // Reference to file
  bucket: 's3://mybucket', // Storage location
  operations: ['resize', 'optimize']
});
```

## 🧪 Testing

### Test Setup
```typescript
import Queue from 'bull';
import { RedisAdapter } from 'valkey-glide-ioredis-adapter';

describe('Bull Queue Integration', () => {
  let testQueue: Queue.Queue;

  beforeEach(async () => {
    testQueue = new Queue('test-queue', {
      createClient: () => new RedisAdapter({
        host: 'localhost',
        port: 6379,
        db: 15, // Use separate test database
        lazyConnect: false
      })
    });
    
    // Clean queue before each test
    await testQueue.empty();
  });

  afterEach(async () => {
    await testQueue.close();
  });

  test('should process jobs correctly', async () => {
    let processedData;
    
    testQueue.process('test-job', async (job) => {
      processedData = job.data;
      return 'success';
    });

    await testQueue.add('test-job', { message: 'Hello World' });

    // Wait for job processing
    await new Promise(resolve => {
      testQueue.on('completed', resolve);
    });

    expect(processedData.message).toBe('Hello World');
  });
});
```

## 📈 Monitoring

### Bull Board Integration
```typescript
import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { ExpressAdapter } from '@bull-board/express';

const serverAdapter = new ExpressAdapter();

createBullBoard({
  queues: [
    new BullAdapter(emailQueue),
    new BullAdapter(imageQueue),
    new BullAdapter(reportQueue)
  ],
  serverAdapter
});

serverAdapter.setBasePath('/admin/queues');
app.use('/admin/queues', serverAdapter.getRouter());
```

### Metrics Collection
```typescript
// Custom metrics
let jobMetrics = {
  processed: 0,
  failed: 0,
  avgProcessingTime: 0
};

myQueue.on('completed', (job) => {
  jobMetrics.processed++;
  const processingTime = Date.now() - job.processedOn;
  jobMetrics.avgProcessingTime = 
    (jobMetrics.avgProcessingTime + processingTime) / 2;
});

myQueue.on('failed', () => {
  jobMetrics.failed++;
});
```

## 🔍 Troubleshooting

### Common Issues

**Jobs not processing**
```typescript
// Ensure all clients connect immediately
const createClient = (type) => new RedisAdapter({
  host: 'localhost',
  port: 6379,
  lazyConnect: false, // CRITICAL!
  maxRetriesPerRequest: type === 'client' ? 3 : null
});
```

**Jobs getting stuck**
```typescript
// Configure job timeouts
await myQueue.add('timeout-prone', data, {
  jobTimeout: 30000, // 30 second timeout
  attempts: 2
});
```

**Memory leaks**
```typescript
// Proper cleanup
await myQueue.close();
await redis.disconnect();
```

This guide covers the essential patterns for Bull integration with GLIDE adapter. The key is ensuring immediate connections and proper client configuration for Bull's three-client architecture.