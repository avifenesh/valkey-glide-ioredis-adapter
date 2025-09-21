# Architecture

How the Valkey GLIDE ioredis Adapter works under the hood.

## Overview

The adapter provides a **drop-in replacement** for ioredis while running **Valkey GLIDE** underneath:

```
Your Application (ioredis API)
       ↓
Redis/Cluster Classes (ioredis-compatible)
       ↓
Base/Standalone/Cluster Clients
       ↓
Parameter Translation Layer
       ↓
Valkey GLIDE Native Methods
       ↓
Valkey Server
```

## Core Components

**Public API Layer** (`src/Redis.ts`, `src/Cluster.ts`)
- ioredis-compatible classes
- Drop-in replacement constructors
- Bull/BullMQ helper methods

**Core Client Layer** (`src/BaseClient.ts`)
- Implements Redis commands using GLIDE methods
- Handles parameter/result translation
- Manages pipelines and transactions

**Connection Management** (`src/utils/OptionsMapper.ts`)
- Converts ioredis options to GLIDE configuration
- Single source of truth for option mapping

**Command Modules** (`src/commands/`)
- Organized by data type (strings, hashes, lists, etc.)
- Direct GLIDE method calls where possible
- Custom commands for missing GLIDE methods

## Key Design Principles

**Pure GLIDE Architecture**
- Only uses Valkey GLIDE APIs
- No direct Redis protocol manipulation
- All server communication through GLIDE clients

**API Compatibility**
- Method names match ioredis exactly
- Parameter shapes identical to ioredis
- Return values match ioredis format
- Error handling preserves ioredis behavior

**Performance Focus**
- Translation happens once at API boundary
- Native GLIDE execution for all operations
- Minimal overhead between layers

## Dual-Mode Support

**Standalone Client** (`src/StandaloneClient.ts`)
- Single Redis server connections
- Database selection support
- Simple pub/sub

**Cluster Client** (`src/ClusterClient.ts`)
- Multi-node Redis clusters
- Sharded pub/sub support
- Cross-slot operation handling

## Special Features

**Pub/Sub Architecture**
- Native GLIDE callbacks for performance
- TCP-based mode for binary compatibility (Socket.IO)
- Automatic mode selection based on usage

**Transaction Support**
- GLIDE Transaction objects for MULTI/EXEC
- Pipeline batching for non-atomic operations
- WATCH/UNWATCH semantics preserved

**Command Coverage**
- Hand-mapped high-value commands
- Dynamic stubs for full ioredis command surface
- Graceful fallback to customCommand

This architecture ensures **100% ioredis compatibility** while leveraging **GLIDE's high-performance Rust core**.