### Command Mapping Plan (GLIDE ↔ ioredis)

- **Purpose**: Define the authoritative plan for implementing commands, keeping only explicitly implemented APIs. Avoid dynamic stubs. Group by family, map GLIDE signatures to ioredis, note adaptations, and file placement.

## Families and Files
- Base families (shared):
  - strings → `src/commands/strings.ts`
  - keys → `src/commands/keys.ts`
  - hashes → `src/commands/hashes.ts`
  - lists → `src/commands/lists.ts`
  - sets → `src/commands/sets.ts`
  - zsets → `src/commands/zsets.ts`
  - streams → `src/commands/streams.ts`
  - pubsub → `src/commands/pubsub.ts`
  - server/info/client → `src/commands/server.ts`
  - scripting → `src/commands/scripting.ts`
  - bitmaps → `src/commands/bitmaps.ts`
  - hyperloglog → `src/commands/hll.ts`
  - json (module) → `src/commands/json.ts`
- Standalone overrides (rare): `src/standalone/` per family when behavior differs.
- Cluster overrides (routing/multi-slot behavior): `src/cluster/` per family when behavior differs.
- `BaseClient` composes these modules; `StandaloneClient` and `ClusterClient` override only where necessary.

## Scripts (special handling)
- ioredis API: `eval`, `evalsha`, `script load`, `script exists`, `script flush`, `script kill`.
- GLIDE: `Script` class + `invokeScript`, plus `scriptLoad`, `scriptExists`, `scriptFlush`, `scriptKill` methods (BaseClient.d.ts). 
- Adapter plan:
  - `eval(script, numKeys, ...keysArgs)`: construct `Script`, normalize keys/args, call `invokeScript` and cache SHA (existing); prefer GLIDE path; if needed, `customCommand EVAL` fallback.
  - `evalsha(sha1, numKeys, ...keysArgs)`: use cache to `invokeScript`; if missing, return `NOSCRIPT` error consistent with ioredis.
  - `scriptLoad(script)`: compute SHA, cache `Script`, return hex.
  - `scriptExists([...sha])`: use GLIDE `scriptExists` if available; otherwise `customCommand`.
  - `scriptFlush(mode?)`, `scriptKill()`: use GLIDE if available; otherwise `customCommand`.
- Cluster notes:
  - Route: scripts should execute on the correct node (key slot owner). GLIDE handles routing for `invokeScript`; ensure keys map to single slot for atomic transactions.

Implementation notes (adapter):
- Extracted to `src/commands/scripting.ts`; BaseClient delegates `eval/evalsha/script*`.
- Per-instance cache via WeakMap for `evalsha` parity; keys normalized with `keyPrefix`.

## Batch (transactions vs pipelines)
- ioredis: `multi()` returns collector; `exec()` returns `[err|null, result]` array or `null` on WATCH violation; `discard()`. `watch/unwatch` around transactions.
- GLIDE: `Batch` (non-atomic / pipeline), `Transaction` (atomic), and `exec(batch, raiseOnError, options)`; Cluster has `ClusterBatch` and routing semantics.
- Adapter plan:
  - `pipeline()`: create Batch(false); collect commands; `exec` maps results to ioredis `Array<[Error|null, any]>` preserving order.
  - `multi()`: create Transaction; same mapping; return `null` on WATCH violation; do not raise on command runtime errors; they become entries `[Error, null]`.
  - `watch(...keys)`, `unwatch()`: use GLIDE `watch(keys)`/`unwatch()`.
  - Cluster:
    - Atomic batches must target a single slot; GLIDE enforces; document error behavior.
    - Non-atomic pipelines: GLIDE auto-splits per-slot; partial errors are returned as items; keep order in mapped results.

## Mapping (sample, high-value first)

### Strings
- GLIDE: `get`, `getex`, `getdel`, `getrange`, `set`, `mget`, `mset`, `msetnx`, `incr`, `incrBy`, `incrByFloat`, `decr`, `decrBy`, `append`, `strlen`, `setrange`, `setbit`, `getbit`, `bitcount`, `bitop`.
- ioredis: `get`, `getex`, `getdel`, `getrange`, `set`, `mget`, `mset`, `msetnx`, `incr`, `incrby`, `incrbyfloat`, `decr`, `decrby`, `append`, `strlen`, `setrange`, `setbit`, `getbit`, `bitcount`, `bitop`.
- Notes: `set` options translator (EX/PX/EXAT/PXAT, NX/XX, KEEPTTL, GET→returnOldValue). `getex` flags to `{expiry}`.
- Placement: `strings.ts`.

Key prefix: All implemented families normalize keys via instance-aware `BaseClient.normalizeKey` (including lists/sets/zsets and new bitmaps/hll). Avoid using `ParameterTranslator.normalizeKey` in command modules.

### Keys
- GLIDE: `del`, `dump`, `restore`, `exists`, `expire`, `pexpire`, `persist`, `ttl`, `pttl`, `type`, `copy`, `move`, `randomKey`, `scan`/`ClusterScanCursor`.
- ioredis: `del`, `dump`, `restore`, `exists`, `expire`, `pexpire`, `expireat`, `pexpireat`, `persist`, `ttl`, `pttl`, `type`, `copy`, `move`, `randomkey`, `unlink`, `touch`, `scan`, `scanStream`.
- Notes: `unlink`, `touch`, `expireat`, `pexpireat` via `customCommand`. `scanStream` wrapper; cluster uses `ClusterScanCursor`.
- Placement: `keys.ts`; cluster variant `cluster/keys.ts` for scan.

### Hashes, Lists, Sets, Zsets, Streams
- As previously outlined; see GLIDE BaseClient.d.ts for full signatures; map directly; add glue where ioredis shapes differ (e.g., zrevrangebyscore flattening, stream tuple shapes).

### Pub/Sub
- Dual-mode implemented (GLIDE callback vs TCP ioredis-compatible). Ensure event parity (`message`, `messageBuffer`, `pmessage`, `pmessageBuffer`, counts), sharded support only in cluster.

### Server / Client / Scripting
- `ping`, `info`, `client*`, `config*`, `time`, `dbsize`, `flushall`, `flushdb` mapped; `customCommand` where needed.

Added server/admin module at `src/commands/server.ts` and delegated in BaseClient. Added `save`/`bgsave` as passthroughs.

## Coverage matrix (approach)
- Source list: `@ioredis/commands` `list` (lowercased). For each command:
  - GLIDE availability: BaseClient/GlideClient/GlideClusterClient supports natively? If not, `customCommand` viable?
  - Placement: family file path.
  - Adaptation: arg normalization, return shape, keyPrefix, cluster multi-slot behavior.
  - Status: implemented/pending.
- We’ll generate and maintain this matrix progressively while implementing families.

## Special Cluster Behaviors
- Multi-key commands (mget/mset/del/copy/sort): split per slot; atomicity per slot. Transactions require single-slot keys. `publish` supports sharded in cluster. `scan` uses `ClusterScanCursor`.

SCAN (cluster) specifics:
- We use GLIDE `ClusterScanCursor`; the ioredis `cursor` string we return is an opaque token (from `getCursor()`), and becomes `'0'` only when `isFinished()` is true.
- Options supported: `MATCH`, `COUNT`, `TYPE` → map to GLIDE `ClusterScanOptions`.
- Adapter option: `scanAllowNonCoveredSlots?: boolean` (default false). When true (cluster), pass `allowNonCoveredSlots` to GLIDE to continue scanning through topology gaps.
- `scanStream` in cluster iterates with `ClusterScanCursor` and respects the same option.

Cluster overrides we maintain in code:
- `ClusterClient.scan(...)`: uses GLIDE `ClusterScanCursor`, returns opaque token, supports `MATCH/COUNT/TYPE`, respects `scanAllowNonCoveredSlots`.
- `ClusterClient.dbsize()`: uses GLIDE cluster `dbsize()` to aggregate across nodes.
- Scripting: we defer to GLIDE for routing and single-slot enforcement; no manual CRC16 checks in adapter.
