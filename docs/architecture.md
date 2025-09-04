### Valkey GLIDE ioredis Adapter: Architecture

This adapter provides a drop-in replacement for ioredis while running Valkey GLIDE under the hood. The core tenet is: accept ioredis semantics at the API boundary, translate once, and execute natively against GLIDE. This document outlines the layers and key decisions so contributors can reason about the design.

- **Public API layer (ioredis facade)**
  - `src/Redis.ts` (standalone) and `src/Cluster.ts` (cluster) are the only externally consumed entry points. They mirror ioredis classes and constructor signatures and delegate to the internal clients.
  - They carry Bull/BullMQ helper creators (e.g., `createClient`) and support `duplicate()` semantics.

- **Core client layer (adapter logic)**
  - `src/BaseClient.ts` implements the vast majority of ioredis commands by delegating to GLIDE methods, normalizing args/returns, and aligning edge-case behavior with ioredis.
  - Pipelines and transactions are backed by GLIDE `Batch`/`Transaction`, returning ioredis-compatible results.
  - Lua/script support prefers GLIDE `Script` and falls back to `EVAL` via `customCommand`.
  - Streams, JSON module, and other commands use `customCommand` where GLIDE has no dedicated API, preserving ioredis return shapes.
  - Pub/Sub uses a dual-mode approach:
    - GLIDE-native callback mode (default) for performance (text messages).
    - ioredis-compatible TCP mode via `IoredisPubSubClient` when `enableEventBasedPubSub` is true (binary-safe for Socket.IO, etc.).
  - A runtime command surface shim attaches stubs for all ioredis commands from `@ioredis/commands` that we have not implemented explicitly. These stubs route to `call()` which uses GLIDE `customCommand`. This guarantees that any ioredis command is callable even if not yet hand-mapped, without polluting the design.

- **Client creation (single source of truth)**
  - Problem fixed: creation previously mixed ioredis and GLIDE concerns in multiple places. The mapping is now centralized.
  - `src/utils/OptionsMapper.ts` is the single source of truth for translating ioredis-style options into GLIDE configuration objects:
    - `toGlideStandaloneConfig(options: RedisOptions): GlideClientConfiguration`
    - `toGlideClusterConfig(nodes: ClusterNode[], options: ClusterOptions): GlideClusterClientConfiguration`
  - Both `StandaloneClient` and `ClusterClient` now call into this mapper and only construct GLIDE clients with GLIDE-native configs. The facade receives ioredis options; the core only sees GLIDE configs.

- **Internal clients**
  - `src/StandaloneClient.ts` and `src/ClusterClient.ts` extend `BaseClient` and implement client-specific pieces only:
    - Creation via the shared `OptionsMapper`.
    - Cluster scanning via `ClusterScanCursor`.
    - Standalone scanning via `SCAN`.
    - Pub/Sub specifics including sharded subscriptions on cluster.
    - Minimal overrides like `unwatch()` to match GLIDE signatures.

- **Type surface**
  - `src/types/index.ts` defines adapter-level types used by the public API (e.g., `RedisOptions`, `Pipeline`, `Multi`).
  - Dynamic command stubs are intentionally typed at runtime; for TS ergonomics we can optionally generate ambient typings from `@ioredis/commands` in a future improvement.

- **Compatibility goals**
  - ioredis API compatibility: method names, argument parsing, and return values match expectations used by Bull/BullMQ, Socket.IO, Express session stores, etc.
  - Behavior alignment: handling edge cases (e.g., `scan` cursors, `withscores` flattening, script caching) to avoid breaking consumers.
  - Zero-queue option semantics: `enableOfflineQueue: false` maps to `inflightRequestsLimit = 0`.
  - Read routing policies are exposed through GLIDE’s `readFrom` while preserving legacy toggles like `enableReadFromReplicas`.

- **Testing strategy**
  - Unit tests validate translators and command shapes.
  - Integration tests cover pipelines, transactions, streams, JSON, pub/sub, and cluster behaviors.
  - Downstream validation with Bull/BullMQ and Socket.IO.

### Refactor summary (what changed)

- Introduced `src/utils/OptionsMapper.ts` to centralize option translation from ioredis to GLIDE.
- Refactored `StandaloneClient.createClient` and `ClusterClient.createClient` to use the mapper (no direct ioredis-to-GLIDE mixing in clients).
- Added dynamic ioredis command stubs in `BaseClient.attachIoredisCommandStubs()` using `@ioredis/commands` to ensure full command surface is callable.
- Fixed linter errors and removed incorrect cluster transaction/watch code that referenced an undefined variable.
- Kept the dual pub/sub architecture with a safer, binary-aware path for event-based mode.

### Future enhancements

- Optional type generation step to expose better typings for dynamically attached commands.
- More explicit command implementations for hot-paths where translation overhead matters.
- Improve cluster `scan` cursor continuity by maintaining cross-call cursor state if needed for very long scans.
- Consolidate JSON and other module command return-shape discrepancies under shared helpers.
