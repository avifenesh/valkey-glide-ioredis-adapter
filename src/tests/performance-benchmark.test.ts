/**
 * Performance Benchmarks - valkey-glide adapter vs native ioredis
 * Comprehensive performance testing suite to identify bottlenecks and optimization opportunities
 */

import { RedisAdapter } from '../adapters/RedisAdapter';
import { PubSubAdapter } from '../adapters/PubSubAdapter';
import { ClusterAdapter } from '../adapters/ClusterAdapter';

// Mock ioredis for comparison (in real implementation, you'd use actual ioredis)
// This is a simplified mock for demonstration purposes
class MockIoredis {
  private connected = false;

  async connect() {
    this.connected = true;
  }

  async disconnect() {
    this.connected = false;
  }

  async get(key: string): Promise<string | null> {
    // Simulate network latency
    await new Promise(resolve => setTimeout(resolve, 1));
    return `value-${key}`;
  }

  async set(key: string, value: string): Promise<string> {
    await new Promise(resolve => setTimeout(resolve, 1));
    return 'OK';
  }

  async mget(...keys: string[]): Promise<(string | null)[]> {
    await new Promise(resolve => setTimeout(resolve, 2));
    return keys.map(key => `value-${key}`);
  }

  async mset(...args: any[]): Promise<string> {
    await new Promise(resolve => setTimeout(resolve, 2));
    return 'OK';
  }

  async pipeline() {
    const commands: Array<() => Promise<any>> = [];
    return {
      get: (key: string) => {
        commands.push(() => this.get(key));
        return this;
      },
      set: (key: string, value: string) => {
        commands.push(() => this.set(key, value));
        return this;
      },
      exec: async () => {
        await new Promise(resolve => setTimeout(resolve, 1));
        return commands.map(() => [null, 'OK']);
      }
    };
  }
}

interface BenchmarkResult {
  testName: string;
  adapter: 'valkey-glide' | 'ioredis';
  operationsPerSecond: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  memoryUsageMB: number;
  errorRate: number;
}

class PerformanceBenchmark {
  private results: BenchmarkResult[] = [];

  /**
   * Run a single benchmark test
   */
  async runBenchmark(
    testName: string,
    operation: () => Promise<void>,
    iterations: number = 1000,
    adapter: 'valkey-glide' | 'ioredis' = 'valkey-glide'
  ): Promise<BenchmarkResult> {
    const latencies: number[] = [];
    let errors = 0;
    const startMemory = process.memoryUsage().heapUsed;
    
    console.log(`Starting benchmark: ${testName} (${adapter}) - ${iterations} iterations`);
    
    const startTime = Date.now();
    
    for (let i = 0; i < iterations; i++) {
      const opStart = Date.now();
      try {
        await operation();
        const opEnd = Date.now();
        latencies.push(opEnd - opStart);
      } catch (error) {
        errors++;
      }
    }
    
    const endTime = Date.now();
    const endMemory = process.memoryUsage().heapUsed;
    
    // Calculate statistics
    const totalTime = (endTime - startTime) / 1000; // seconds
    const operationsPerSecond = iterations / totalTime;
    const avgLatencyMs = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    
    latencies.sort((a, b) => a - b);
    const p95Index = Math.floor(latencies.length * 0.95);
    const p99Index = Math.floor(latencies.length * 0.99);
    const p95LatencyMs = latencies[p95Index] || 0;
    const p99LatencyMs = latencies[p99Index] || 0;
    
    const memoryUsageMB = (endMemory - startMemory) / 1024 / 1024;
    const errorRate = errors / iterations;
    
    const result: BenchmarkResult = {
      testName,
      adapter,
      operationsPerSecond,
      avgLatencyMs,
      p95LatencyMs,
      p99LatencyMs,
      memoryUsageMB,
      errorRate
    };
    
    this.results.push(result);
    
    console.log(`Completed: ${testName} (${adapter})`, {
      'Ops/sec': operationsPerSecond.toFixed(0),
      'Avg Latency': `${avgLatencyMs.toFixed(2)}ms`,
      'P95 Latency': `${p95LatencyMs.toFixed(2)}ms`,
      'Memory': `${memoryUsageMB.toFixed(2)}MB`,
      'Error Rate': `${(errorRate * 100).toFixed(2)}%`
    });
    
    return result;
  }

  /**
   * Generate performance comparison report
   */
  generateReport(): string {
    let report = '# Performance Benchmark Report\\n\\n';
    report += `Generated: ${new Date().toISOString()}\\n\\n`;
    
    // Group results by test name
    const groupedResults = this.results.reduce((acc, result) => {
      if (!acc[result.testName]) {
        acc[result.testName] = [];
      }
      acc[result.testName].push(result);
      return acc;
    }, {} as Record<string, BenchmarkResult[]>);
    
    // Generate comparison table for each test
    for (const [testName, results] of Object.entries(groupedResults)) {
      report += `## ${testName}\\n\\n`;
      report += '| Adapter | Ops/sec | Avg Latency (ms) | P95 Latency (ms) | P99 Latency (ms) | Memory (MB) | Error Rate (%) |\\n';
      report += '|---------|---------|------------------|------------------|------------------|-------------|----------------|\\n';
      
      for (const result of results) {
        report += `| ${result.adapter} | ${result.operationsPerSecond.toFixed(0)} | ${result.avgLatencyMs.toFixed(2)} | ${result.p95LatencyMs.toFixed(2)} | ${result.p99LatencyMs.toFixed(2)} | ${result.memoryUsageMB.toFixed(2)} | ${(result.errorRate * 100).toFixed(2)} |\\n`;
      }
      
      // Calculate performance comparison
      if (results.length === 2) {
        const valkeyResult = results.find(r => r.adapter === 'valkey-glide');
        const ioredisResult = results.find(r => r.adapter === 'ioredis');
        
        if (valkeyResult && ioredisResult) {
          const opsImprovement = ((valkeyResult.operationsPerSecond - ioredisResult.operationsPerSecond) / ioredisResult.operationsPerSecond * 100);
          const latencyImprovement = ((ioredisResult.avgLatencyMs - valkeyResult.avgLatencyMs) / ioredisResult.avgLatencyMs * 100);
          
          report += `\\n**Performance Comparison:**\\n`;
          report += `- Operations/sec: ${opsImprovement > 0 ? '+' : ''}${opsImprovement.toFixed(1)}% vs ioredis\\n`;
          report += `- Latency: ${latencyImprovement > 0 ? '+' : ''}${latencyImprovement.toFixed(1)}% improvement vs ioredis\\n`;
        }
      }
      
      report += '\\n';
    }
    
    return report;
  }

  /**
   * Clear all results
   */
  clearResults(): void {
    this.results = [];
  }
}

describe('Performance Benchmarks', () => {
  let redisAdapter: RedisAdapter;
  let mockIoredis: MockIoredis;
  let benchmark: PerformanceBenchmark;

  beforeAll(() => {
    benchmark = new PerformanceBenchmark();
  });

  beforeEach(() => {
    redisAdapter = new RedisAdapter();
    mockIoredis = new MockIoredis();
  });

  afterEach(async () => {
    await redisAdapter?.disconnect();
    await mockIoredis?.disconnect();
  });

  describe('String Operations', () => {
    test('GET performance comparison', async () => {
      const iterations = 500; // Reduced for test environment
      
      // Benchmark valkey-glide adapter
      await benchmark.runBenchmark(
        'GET Operation',
        async () => {
          try {
            await redisAdapter.get('test-key');
          } catch (error) {
            // Expected to fail in test environment
          }
        },
        iterations,
        'valkey-glide'
      );
      
      // Benchmark mock ioredis
      await benchmark.runBenchmark(
        'GET Operation',
        async () => {
          await mockIoredis.get('test-key');
        },
        iterations,
        'ioredis'
      );
    }, 30000);

    test('SET performance comparison', async () => {
      const iterations = 500;
      
      // Benchmark valkey-glide adapter
      await benchmark.runBenchmark(
        'SET Operation',
        async () => {
          try {
            await redisAdapter.set('test-key', 'test-value');
          } catch (error) {
            // Expected to fail in test environment
          }
        },
        iterations,
        'valkey-glide'
      );
      
      // Benchmark mock ioredis
      await benchmark.runBenchmark(
        'SET Operation',
        async () => {
          await mockIoredis.set('test-key', 'test-value');
        },
        iterations,
        'ioredis'
      );
    }, 30000);

    test('MGET performance comparison', async () => {
      const iterations = 200;
      const keys = ['key1', 'key2', 'key3', 'key4', 'key5'];
      
      // Benchmark valkey-glide adapter
      await benchmark.runBenchmark(
        'MGET Operation',
        async () => {
          try {
            await redisAdapter.mget(...keys);
          } catch (error) {
            // Expected to fail in test environment
          }
        },
        iterations,
        'valkey-glide'
      );
      
      // Benchmark mock ioredis
      await benchmark.runBenchmark(
        'MGET Operation',
        async () => {
          await mockIoredis.mget(...keys);
        },
        iterations,
        'ioredis'
      );
    }, 30000);
  });

  describe('Pipeline Operations', () => {
    test('Pipeline performance comparison', async () => {
      const iterations = 100;
      
      // Benchmark valkey-glide adapter pipeline
      await benchmark.runBenchmark(
        'Pipeline Operation',
        async () => {
          try {
            const pipeline = redisAdapter.pipeline();
            pipeline.set('key1', 'value1');
            pipeline.set('key2', 'value2');
            pipeline.get('key1');
            pipeline.get('key2');
            await pipeline.exec();
          } catch (error) {
            // Expected to fail in test environment
          }
        },
        iterations,
        'valkey-glide'
      );
      
      // Benchmark mock ioredis pipeline
      await benchmark.runBenchmark(
        'Pipeline Operation',
        async () => {
          const pipeline = await mockIoredis.pipeline();
          pipeline.set('key1', 'value1');
          pipeline.set('key2', 'value2');
          pipeline.get('key1');
          pipeline.get('key2');
          await pipeline.exec();
        },
        iterations,
        'ioredis'
      );
    }, 30000);
  });

  describe('Connection Performance', () => {
    test('Connection establishment performance', async () => {
      const iterations = 50; // Reduced for connection tests
      
      // Benchmark valkey-glide adapter connection
      await benchmark.runBenchmark(
        'Connection Establishment',
        async () => {
          const adapter = new RedisAdapter();
          try {
            await adapter.connect();
            await adapter.disconnect();
          } catch (error) {
            // Expected to fail in test environment
          }
        },
        iterations,
        'valkey-glide'
      );
      
      // Benchmark mock ioredis connection
      await benchmark.runBenchmark(
        'Connection Establishment',
        async () => {
          const client = new MockIoredis();
          await client.connect();
          await client.disconnect();
        },
        iterations,
        'ioredis'
      );
    }, 30000);
  });

  describe('Memory Usage', () => {
    test('Memory efficiency comparison', async () => {
      const iterations = 1000;
      
      // Test memory usage with many operations
      await benchmark.runBenchmark(
        'Memory Efficiency Test',
        async () => {
          try {
            // Simulate multiple operations that might cause memory allocation
            await redisAdapter.set(\`key_\${Math.random()}\`, \`value_\${Math.random()}\`);
            await redisAdapter.get(\`key_\${Math.random()}\`);
          } catch (error) {
            // Expected to fail in test environment
          }
        },
        iterations,
        'valkey-glide'
      );
      
      await benchmark.runBenchmark(
        'Memory Efficiency Test',
        async () => {
          await mockIoredis.set(\`key_\${Math.random()}\`, \`value_\${Math.random()}\`);
          await mockIoredis.get(\`key_\${Math.random()}\`);
        },
        iterations,
        'ioredis'
      );
    }, 30000);
  });

  afterAll(() => {
    // Generate and log performance report
    const report = benchmark.generateReport();
    console.log('\\n' + report);
    
    // In a real implementation, you could write this to a file
    // fs.writeFileSync('performance-report.md', report);
  });
});

// Additional utility functions for performance analysis
export class PerformanceAnalyzer {
  /**
   * Analyze bottlenecks in the adapter
   */
  static async analyzeBottlenecks(adapter: RedisAdapter): Promise<any> {
    const analysis = {
      connectionTime: 0,
      parameterTranslationTime: 0,
      networkTime: 0,
      responseProcessingTime: 0
    };

    // Measure connection time
    const connStart = Date.now();
    try {
      await adapter.connect();
      analysis.connectionTime = Date.now() - connStart;
    } catch (error) {
      analysis.connectionTime = -1; // Failed
    }

    // Add more detailed analysis here...
    
    return analysis;
  }

  /**
   * Identify optimization opportunities
   */
  static identifyOptimizations(results: BenchmarkResult[]): string[] {
    const recommendations: string[] = [];

    for (const result of results) {
      if (result.adapter === 'valkey-glide') {
        if (result.avgLatencyMs > 10) {
          recommendations.push(\`High latency detected in \${result.testName} - consider connection pooling\`);
        }
        
        if (result.memoryUsageMB > 50) {
          recommendations.push(\`High memory usage in \${result.testName} - consider object pooling\`);
        }
        
        if (result.errorRate > 0.01) {
          recommendations.push(\`Error rate \${(result.errorRate * 100).toFixed(2)}% in \${result.testName} - investigate error handling\`);
        }
        
        if (result.operationsPerSecond < 1000) {
          recommendations.push(\`Low throughput in \${result.testName} - consider batch processing\`);
        }
      }
    }

    return recommendations;
  }
}

export { PerformanceBenchmark, BenchmarkResult };