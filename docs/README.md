# Documentation

Welcome to the Valkey GLIDE ioredis Adapter documentation! 📚

## 📋 Quick Navigation

### 🚀 Getting Started
- **[Installation Guide](../README.md#-installation)** - Set up the adapter
- **[Basic Usage](../README.md#-basic-usage)** - Your first Valkey commands
- **[Migration Guide](./guides/migration-from-ioredis.md)** - Switch from ioredis

### 📖 API Reference
- **[RedisAdapter API](./api/redis-adapter.md)** - Complete method reference
- **[ClusterAdapter API](./api/cluster-adapter.md)** - Valkey/Redis Cluster support
- **[Configuration Options](./api/configuration.md)** - All connection options

### 🏗️ Integration Guides
- **[Bull Integration](./guides/bull-integration.md)** - Job queue setup
- **[BullMQ Integration](./guides/bullmq-integration.md)** - Modern job queues
- **[Socket.IO Integration](./guides/socketio-integration.md)** - Real-time apps
- **[Express Session](./guides/express-session.md)** - Session storage

### 💡 Examples
- **[Basic Operations](./examples/basic-operations.md)** - CRUD operations
- **[Advanced Patterns](./examples/advanced-patterns.md)** - Complex use cases
- **[Performance Optimization](./examples/performance-optimization.md)** - Best practices
- **[Error Handling](./examples/error-handling.md)** - Robust applications

### 🔧 Development
- **[Architecture Overview](./guides/architecture.md)** - How it works
- **[Contributing Guide](../CONTRIBUTING.md)** - Development workflow
- **[Testing Guide](./guides/testing.md)** - Test your integrations

## 🎯 Key Features

### ✅ 100% ioredis Compatible
Drop-in replacement for ioredis with identical API behavior.

### ⚡ High Performance
Powered by Valkey GLIDE's Rust core for optimal performance.

### 🔌 Library Support
Works with popular Valkey/Redis libraries:
- **Bull** - Background job processing
- **BullMQ** - Modern job queue system
- **Socket.IO** - Real-time communication
- **Express Session** - Web session storage
- **Rate Limiting** - API rate limiting

### 🛡️ Production Ready
- Comprehensive error handling
- Connection pooling and management
- TypeScript definitions included
- Extensive test coverage

## 📊 Performance

Built on Valkey GLIDE's high-performance Rust core for optimal throughput and efficiency. Actual performance depends on your specific workload and environment - we recommend benchmarking your own use case.

## 🚨 Migration Notes

### From ioredis v5
- **Zero code changes** for basic operations
- **Pub/Sub patterns** require minor adjustments
- **Lua scripts** work identically
- **Cluster support** available via ClusterAdapter

### Breaking Changes
- None! This is a drop-in replacement

## 🆘 Getting Help

1. **Documentation** - Check these guides first
2. **GitHub Issues** - Report bugs or request features
3. **GitHub Discussions** - Ask questions and share ideas
4. **Examples** - See working code samples

## 📈 Roadmap

- **v0.2.x** - Complete Bull/BullMQ integration
- **v0.3.x** - Advanced Redis Streams support
- **v0.4.x** - Enhanced clustering features
- **v1.0.x** - Production stability milestone

---

**Need immediate help?** Check our [troubleshooting guide](./guides/troubleshooting.md) or [open an issue](https://github.com/avifenesh/valkey-glide-ioredis-adapter/issues/new/choose).