# Phase 2 Implementation Strategy: Architectural Bridges to Perfection

## Executive Summary

Based on comprehensive analysis of GLIDE APIs and behavioral differences, this document outlines the detailed implementation strategy for Phase 2, focusing on the most complex architectural challenges that will achieve our goal of 87% customCommand reduction and 99%+ test pass rate.

**Key Insight**: The challenges are not missing functionality but fundamental architectural pattern differences that require sophisticated bridging solutions.

## 🎯 **Strategic Overview**

### **Phase 2.1: Pub/Sub Architecture Bridge** (Weeks 1-2)
**Challenge**: GLIDE uses connection-time configuration with callbacks vs ioredis dynamic subscription with EventEmitter
**Impact**: 10 customCommands → 0 (13% of total reduction)
**Complexity**: HIGH - Requires connection management and event translation

### **Phase 2.2: Script Management Migration** (Weeks 3-4)  
**Challenge**: GLIDE uses Script objects vs ioredis eval/evalsha strings
**Impact**: 12 customCommands → 0 (16% of total reduction)
**Complexity**: MEDIUM - Requires object lifecycle management

### **Phase 2.3: Utility Commands Migration** (Weeks 5-6)
**Challenge**: Parameter/result format differences
**Impact**: 24 customCommands → ~5 (25% of total reduction)
**Complexity**: LOW - Mostly translation layers

## 🏗️ **Phase 2.1: Pub/Sub Architecture Bridge**

### **Problem Analysis**
Based on [GLIDE General Concepts - PubSub Support](https://github.com/valkey-io/valkey-glide/wiki/General-Concepts#pubsub-support):

**ioredis Expectations**:
```typescript
const redis = new Redis();
redis.on('message', (channel, message) => { /* handle */ });
redis.on('pmessage', (pattern, channel, message) => { /* handle */ });
await redis.subscribe('news');
await redis.psubscribe('news.*');
await redis.unsubscribe('news');
```

**GLIDE Reality**:
```typescript
// Connection-time configuration only
const config = {
  pubsubSubscriptions: {
    channelsAndPatterns: {
      [PubSubChannelModes.Exact]: new Set(['news']),
      [PubSubChannelModes.Pattern]: new Set(['news.*'])
    },
    callback: (msg: PubSubMsg, context: any) => { /* handle */ }
  }
};
// No dynamic subscribe/unsubscribe!
```

### **Solution Architecture: Dynamic Connection Manager**

#### **1. PubSubBridge Class Design**
```typescript
import { EventEmitter } from 'events';
import { GlideClient, GlideClientConfiguration, PubSubMsg, PubSubChannelModes } from '@valkey/valkey-glide';

class PubSubBridge extends EventEmitter {
  private baseConfig: GlideClientConfiguration;
  private activeSubscriptions = new Map<string, GlideClient>();
  private activePatterns = new Map<string, GlideClient>();
  private subscriptionCounts = new Map<string, number>();
  private patternCounts = new Map<string, number>();
  
  constructor(baseConfig: GlideClientConfiguration) {
    super();
    this.baseConfig = { ...baseConfig };
    delete this.baseConfig.pubsubSubscriptions; // Remove any existing pub/sub config
  }
  
  async subscribe(channel: string): Promise<void> {
    // Increment subscription count
    const currentCount = this.subscriptionCounts.get(channel) || 0;
    this.subscriptionCounts.set(channel, currentCount + 1);
    
    // If already subscribed, just emit the subscribe event
    if (this.activeSubscriptions.has(channel)) {
      this.emit('subscribe', channel, this.subscriptionCounts.get(channel));
      return;
    }
    
    // Create new GLIDE client for this channel
    const config: GlideClientConfiguration = {
      ...this.baseConfig,
      pubsubSubscriptions: {
        channelsAndPatterns: {
          [PubSubChannelModes.Exact]: new Set([channel])
        },
        callback: this.createChannelCallback(channel),
        context: { channel, type: 'exact' }
      }
    };
    
    const client = await GlideClient.createClient(config);
    this.activeSubscriptions.set(channel, client);
    this.emit('subscribe', channel, this.subscriptionCounts.get(channel));
  }
  
  async psubscribe(pattern: string): Promise<void> {
    // Similar logic for pattern subscriptions
    const currentCount = this.patternCounts.get(pattern) || 0;
    this.patternCounts.set(pattern, currentCount + 1);
    
    if (this.activePatterns.has(pattern)) {
      this.emit('psubscribe', pattern, this.patternCounts.get(pattern));
      return;
    }
    
    const config: GlideClientConfiguration = {
      ...this.baseConfig,
      pubsubSubscriptions: {
        channelsAndPatterns: {
          [PubSubChannelModes.Pattern]: new Set([pattern])
        },
        callback: this.createPatternCallback(pattern),
        context: { pattern, type: 'pattern' }
      }
    };
    
    const client = await GlideClient.createClient(config);
    this.activePatterns.set(pattern, client);
    this.emit('psubscribe', pattern, this.patternCounts.get(pattern));
  }
  
  async unsubscribe(channel?: string): Promise<void> {
    if (!channel) {
      // Unsubscribe from all channels
      for (const [ch, client] of this.activeSubscriptions) {
        await client.close();
        this.emit('unsubscribe', ch, 0);
      }
      this.activeSubscriptions.clear();
      this.subscriptionCounts.clear();
      return;
    }
    
    const count = this.subscriptionCounts.get(channel) || 0;
    if (count <= 1) {
      // Last subscription, close the client
      const client = this.activeSubscriptions.get(channel);
      if (client) {
        await client.close();
        this.activeSubscriptions.delete(channel);
      }
      this.subscriptionCounts.delete(channel);
      this.emit('unsubscribe', channel, 0);
    } else {
      // Decrement count
      this.subscriptionCounts.set(channel, count - 1);
      this.emit('unsubscribe', channel, count - 1);
    }
  }
  
  async punsubscribe(pattern?: string): Promise<void> {
    // Similar logic for pattern unsubscription
  }
  
  private createChannelCallback(channel: string) {
    return (msg: PubSubMsg, context: any) => {
      // Convert GLIDE callback to ioredis events
      this.emit('message', msg.channel, msg.message);
    };
  }
  
  private createPatternCallback(pattern: string) {
    return (msg: PubSubMsg, context: any) => {
      // Convert GLIDE callback to ioredis pattern events
      this.emit('pmessage', msg.pattern || pattern, msg.channel, msg.message);
    };
  }
  
  async close(): Promise<void> {
    // Clean up all connections
    const closePromises = [
      ...Array.from(this.activeSubscriptions.values()).map(client => client.close()),
      ...Array.from(this.activePatterns.values()).map(client => client.close())
    ];
    
    await Promise.all(closePromises);
    this.activeSubscriptions.clear();
    this.activePatterns.clear();
    this.subscriptionCounts.clear();
    this.patternCounts.clear();
  }
}
```

#### **2. Integration with RedisAdapter**
```typescript
class RedisAdapter extends EventEmitter {
  private pubsubBridge?: PubSubBridge;
  
  private async ensurePubSubBridge(): Promise<PubSubBridge> {
    if (!this.pubsubBridge) {
      this.pubsubBridge = new PubSubBridge(this.config);
      
      // Forward all pub/sub events to the main adapter
      this.pubsubBridge.on('message', (channel, message) => {
        this.emit('message', channel, message);
      });
      
      this.pubsubBridge.on('pmessage', (pattern, channel, message) => {
        this.emit('pmessage', pattern, channel, message);
      });
      
      this.pubsubBridge.on('subscribe', (channel, count) => {
        this.emit('subscribe', channel, count);
      });
      
      this.pubsubBridge.on('psubscribe', (pattern, count) => {
        this.emit('psubscribe', pattern, count);
      });
      
      this.pubsubBridge.on('unsubscribe', (channel, count) => {
        this.emit('unsubscribe', channel, count);
      });
      
      this.pubsubBridge.on('punsubscribe', (pattern, count) => {
        this.emit('punsubscribe', pattern, count);
      });
    }
    
    return this.pubsubBridge;
  }
  
  async subscribe(...channels: string[]): Promise<void> {
    const bridge = await this.ensurePubSubBridge();
    for (const channel of channels) {
      await bridge.subscribe(channel);
    }
  }
  
  async psubscribe(...patterns: string[]): Promise<void> {
    const bridge = await this.ensurePubSubBridge();
    for (const pattern of patterns) {
      await bridge.psubscribe(pattern);
    }
  }
  
  async unsubscribe(...channels: string[]): Promise<void> {
    if (!this.pubsubBridge) return;
    
    if (channels.length === 0) {
      await this.pubsubBridge.unsubscribe();
    } else {
      for (const channel of channels) {
        await this.pubsubBridge.unsubscribe(channel);
      }
    }
  }
  
  async punsubscribe(...patterns: string[]): Promise<void> {
    if (!this.pubsubBridge) return;
    
    if (patterns.length === 0) {
      await this.pubsubBridge.punsubscribe();
    } else {
      for (const pattern of patterns) {
        await this.pubsubBridge.punsubscribe(pattern);
      }
    }
  }
}
```

#### **3. Testing Strategy**
```typescript
// tests/unit/pubsub-bridge.test.ts
describe('PubSubBridge', () => {
  test('dynamic subscription creates GLIDE client', async () => {
    const bridge = new PubSubBridge(config);
    await bridge.subscribe('test-channel');
    
    expect(bridge.activeSubscriptions.has('test-channel')).toBe(true);
  });
  
  test('multiple subscriptions to same channel share client', async () => {
    const bridge = new PubSubBridge(config);
    await bridge.subscribe('test-channel');
    await bridge.subscribe('test-channel');
    
    expect(bridge.subscriptionCounts.get('test-channel')).toBe(2);
  });
  
  test('unsubscribe closes client when count reaches zero', async () => {
    const bridge = new PubSubBridge(config);
    await bridge.subscribe('test-channel');
    await bridge.unsubscribe('test-channel');
    
    expect(bridge.activeSubscriptions.has('test-channel')).toBe(false);
  });
  
  test('pattern subscriptions work independently', async () => {
    const bridge = new PubSubBridge(config);
    await bridge.psubscribe('news.*');
    
    expect(bridge.activePatterns.has('news.*')).toBe(true);
  });
});
```

### **4. Bull Integration Validation**
```typescript
// tests/integration/bull-pubsub.test.ts
describe('Bull Pub/Sub Integration', () => {
  test('Bull queue events work with PubSubBridge', async () => {
    const redis = new RedisAdapter(config);
    const queue = new Bull('test-queue', { createClient: () => redis });
    
    let messageReceived = false;
    redis.on('message', (channel, message) => {
      if (channel.includes('bull:test-queue')) {
        messageReceived = true;
      }
    });
    
    await queue.add('test-job', { data: 'test' });
    await new Promise(resolve => setTimeout(resolve, 100));
    
    expect(messageReceived).toBe(true);
  });
});
```

## 🏗️ **Phase 2.2: Script Management Migration**

### **Problem Analysis**
**ioredis Pattern**:
```typescript
const script = 'return redis.call("SET", KEYS[1], ARGV[1])';
await redis.eval(script, 1, 'mykey', 'myvalue');

const sha = await redis.script('LOAD', script);
await redis.evalsha(sha, 1, 'mykey', 'myvalue');
```

**GLIDE Pattern**:
```typescript
const script = new Script('return redis.call("SET", KEYS[1], ARGV[1])');
await client.invokeScript(script, { keys: ['mykey'], args: ['myvalue'] });
// SHA automatically managed by Script object
```

### **Solution Architecture: ScriptManager**

#### **1. ScriptManager Class Design**
```typescript
import { Script } from '@valkey/valkey-glide';

class ScriptManager {
  private scriptCache = new Map<string, Script>();
  private shaToScript = new Map<string, string>();
  private scriptToSha = new Map<string, string>();
  
  constructor(private client: GlideClient) {}
  
  async eval(script: string, numKeys: number, ...args: any[]): Promise<any> {
    // Parse ioredis format to GLIDE format
    const keys = args.slice(0, numKeys).map(key => String(key));
    const scriptArgs = args.slice(numKeys).map(arg => String(arg));
    
    // Get or create Script object
    let scriptObj = this.scriptCache.get(script);
    if (!scriptObj) {
      scriptObj = new Script(script);
      this.scriptCache.set(script, scriptObj);
      
      const sha = scriptObj.getHash();
      this.shaToScript.set(sha, script);
      this.scriptToSha.set(script, sha);
    }
    
    // Execute with GLIDE
    return await this.client.invokeScript(scriptObj, { keys, args: scriptArgs });
  }
  
  async evalsha(sha: string, numKeys: number, ...args: any[]): Promise<any> {
    // Find script by SHA
    const script = this.shaToScript.get(sha);
    if (!script) {
      throw new Error(`NOSCRIPT No matching script. Please use EVAL.`);
    }
    
    // Use eval method for consistency
    return this.eval(script, numKeys, ...args);
  }
  
  async scriptLoad(script: string): Promise<string> {
    // Create Script object to get SHA
    let scriptObj = this.scriptCache.get(script);
    if (!scriptObj) {
      scriptObj = new Script(script);
      this.scriptCache.set(script, scriptObj);
      
      const sha = scriptObj.getHash();
      this.shaToScript.set(sha, script);
      this.scriptToSha.set(script, sha);
    }
    
    return scriptObj.getHash();
  }
  
  async scriptExists(...shas: string[]): Promise<number[]> {
    return shas.map(sha => this.shaToScript.has(sha) ? 1 : 0);
  }
  
  async scriptFlush(): Promise<string> {
    // Clear caches and use GLIDE's native method
    this.scriptCache.clear();
    this.shaToScript.clear();
    this.scriptToSha.clear();
    
    return await this.client.scriptFlush();
  }
  
  async scriptKill(): Promise<string> {
    return await this.client.scriptKill();
  }
  
  // Enhanced defineCommand for Bull compatibility
  defineCommand(name: string, options: { numberOfKeys: number; lua: string }) {
    const script = options.lua;
    const numKeys = options.numberOfKeys;
    
    // Create method on the client
    (this.client as any)[name] = async (...args: any[]) => {
      return this.eval(script, numKeys, ...args);
    };
  }
}
```

#### **2. Integration with RedisAdapter**
```typescript
class RedisAdapter {
  private scriptManager?: ScriptManager;
  
  private async ensureScriptManager(): Promise<ScriptManager> {
    if (!this.scriptManager) {
      const client = await this.ensureConnected();
      this.scriptManager = new ScriptManager(client);
    }
    return this.scriptManager;
  }
  
  async eval(script: string, numKeys: number, ...args: any[]): Promise<any> {
    const manager = await this.ensureScriptManager();
    return manager.eval(script, numKeys, ...args);
  }
  
  async evalsha(sha: string, numKeys: number, ...args: any[]): Promise<any> {
    const manager = await this.ensureScriptManager();
    return manager.evalsha(sha, numKeys, ...args);
  }
  
  async script(subcommand: string, ...args: any[]): Promise<any> {
    const manager = await this.ensureScriptManager();
    
    switch (subcommand.toUpperCase()) {
      case 'LOAD':
        return manager.scriptLoad(args[0]);
      case 'EXISTS':
        return manager.scriptExists(...args);
      case 'FLUSH':
        return manager.scriptFlush();
      case 'KILL':
        return manager.scriptKill();
      default:
        throw new Error(`Unknown SCRIPT subcommand: ${subcommand}`);
    }
  }
  
  defineCommand(name: string, options: { numberOfKeys: number; lua: string }) {
    const manager = this.ensureScriptManager();
    manager.defineCommand(name, options);
  }
}
```

## 🏗️ **Phase 2.3: Utility Commands Migration**

### **Implementation Strategy**
Most utility commands have direct GLIDE equivalents but require parameter/result translation:

#### **1. INFO Command Migration**
```typescript
async info(section?: string): Promise<string> {
  const client = await this.ensureConnected();
  
  if (section) {
    // GLIDE expects InfoOptions array
    const sections = [section as any]; // Type assertion for compatibility
    return await client.info(sections);
  } else {
    return await client.info();
  }
}
```

#### **2. CONFIG Commands Migration**
```typescript
async config(subcommand: string, ...args: any[]): Promise<any> {
  const client = await this.ensureConnected();
  
  switch (subcommand.toUpperCase()) {
    case 'GET':
      const result = await client.configGet(args);
      // Convert GLIDE object to ioredis flat array
      return ResultTranslator.translateConfigResult(result);
      
    case 'SET':
      const params: Record<string, string> = {};
      for (let i = 0; i < args.length; i += 2) {
        params[args[i]] = args[i + 1];
      }
      return await client.configSet(params);
      
    case 'REWRITE':
      return await client.configRewrite();
      
    case 'RESETSTAT':
      return await client.configResetStat();
      
    default:
      throw new Error(`Unknown CONFIG subcommand: ${subcommand}`);
  }
}
```

#### **3. CLIENT Commands Migration**
```typescript
async client(subcommand: string, ...args: any[]): Promise<any> {
  const client = await this.ensureConnected();
  
  switch (subcommand.toUpperCase()) {
    case 'ID':
      return await client.clientId();
      
    case 'GETNAME':
      return await client.clientGetName();
      
    case 'SETNAME':
      return await client.clientSetName(args[0]);
      
    case 'LIST':
      return await client.clientList();
      
    case 'INFO':
      return await client.clientInfo();
      
    default:
      throw new Error(`Unknown CLIENT subcommand: ${subcommand}`);
  }
}
```

## 📊 **Implementation Timeline & Milestones**

### **Week 1: PubSubBridge Foundation**
- [ ] Implement basic PubSubBridge class
- [ ] Add dynamic subscription management
- [ ] Implement event forwarding
- [ ] Basic unit tests

### **Week 2: PubSubBridge Integration**
- [ ] Integrate with RedisAdapter
- [ ] Pattern subscription support
- [ ] Bull integration testing
- [ ] Performance optimization

### **Week 3: ScriptManager Foundation**
- [ ] Implement ScriptManager class
- [ ] Add script caching and SHA management
- [ ] Implement eval/evalsha bridging
- [ ] Basic unit tests

### **Week 4: ScriptManager Integration**
- [ ] Integrate with RedisAdapter
- [ ] Enhanced defineCommand support
- [ ] Bull Lua script testing
- [ ] Performance validation

### **Week 5: Utility Commands Migration**
- [ ] Migrate INFO, CONFIG, CLIENT commands
- [ ] Implement result translation
- [ ] Add comprehensive testing
- [ ] Performance benchmarking

### **Week 6: Integration & Validation**
- [ ] End-to-end integration testing
- [ ] Performance validation
- [ ] Documentation updates
- [ ] Final customCommand audit

## 🎯 **Success Criteria**

### **Quantitative Goals**
- [ ] **CustomCommand Reduction**: 76 → 10 (87% reduction)
- [ ] **Test Pass Rate**: 99%+ (targeting perfection)
- [ ] **Performance Improvement**: 20%+ over Phase 1
- [ ] **Memory Usage**: 15%+ reduction

### **Qualitative Goals**
- [ ] **100% ioredis API Compatibility**: All method signatures preserved
- [ ] **Bull Integration**: Seamless queue operations
- [ ] **Error Compatibility**: Consistent error types and messages
- [ ] **Production Ready**: Robust error handling and resource management

## 🚨 **Risk Mitigation**

### **Connection Management Risks**
- **Risk**: Resource leaks from multiple GLIDE clients
- **Mitigation**: Comprehensive connection lifecycle management, automated cleanup

### **Performance Risks**
- **Risk**: Bridge overhead negating native method benefits
- **Mitigation**: Lazy initialization, connection pooling, performance monitoring

### **Compatibility Risks**
- **Risk**: Subtle behavioral differences breaking applications
- **Mitigation**: Comprehensive test suite, gradual rollout, fallback mechanisms

---

This implementation strategy provides a detailed roadmap for achieving our Phase 2 goals while maintaining the highest standards of compatibility, performance, and reliability. Each component is designed with both the big picture architecture and small implementation details in mind.
