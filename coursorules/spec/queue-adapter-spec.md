# Queue Compatibility Adapter Spec (Bull, Bee-Queue, BullMQ)

## Goals
- Achieve 100% pass rate on queue-related tests in `TEST_FAILURES_ANALYSIS.md`.
- Ensure binary-compatible behavior with ioredis for queue libs: Bull v3/4, Bee-Queue, BullMQ.

## Sources
- ioredis API (constructor, duplicate, pub/sub, scripts, transactions) — https://ioredis.readthedocs.io/en/latest/API/
- Bull — https://github.com/OptimalBits/bull
- Bee-Queue — https://github.com/bee-queue/bee-queue
- BullMQ — https://github.com/taskforcesh/bullmq/tree/master/src
- Valkey GLIDE (Node) — https://valkey.io/valkey-glide/node/

## Problem Areas (from tests)
1. Bull: job processing timeouts, delays, priorities, retries, stats
2. Bee-Queue: delayed jobs
3. Bull getters returning null (data structure parity gaps)
4. `createClient`/`duplicate` behaviors and custom commands

## Required Behaviors & Design

### 1) Pub/Sub Parity
- Emit ioredis-compatible events: `subscribe`, `unsubscribe`, `psubscribe`, `punsubscribe`, `message`, `pmessage`.
- Ensure subscriber connection is separate and remains in subscriber mode.
- Guarantee message payloads are strings/buffers as per ioredis.
- Map Valkey GLIDE pubsub callback fields to ioredis events reliably.

Implementation adjustments:
- Normalize incoming pubsub message shape: support `{channel, payload}`, `{pattern, channel, payload}`; emit matching events.
- On `disconnect` and `reconnect`, auto re-subscribe (Bull requires resiliency).

### 2) Scripting and Custom Commands
- Bull and BullMQ rely on Lua scripts heavily (atomic operations and queue housekeeping).
- Support `scriptLoad`, `scriptExists`, `scriptFlush`, `eval`, `evalsha`, and `defineCommand`:
  - `defineCommand(name, { lua, numberOfKeys })` must expose `client[name](...args)` with ioredis argument conventions:
    - Accept flat array usage (BullMQ) and variadic usage (ioredis/Bull/Bee-Queue).
    - Encode non-buffer values to strings; keep Buffers intact.
  - `eval/evalsha` must preserve argument order and types; return arrays/strings/numbers as ioredis would.
- On `NOSCRIPT` from `evalsha`, propagate without auto-loading (ioredis parity); Bull handles retries.

Implementation adjustments:
- Ensure `Script` path returns native types expected by callers. If Valkey GLIDE returns typed values, coerce to JS primitives.
- Verify KEYS/ARGV segmentation strictly by `numberOfKeys`.

### 3) Transactions and Atomicity
- Bull uses MULTI/EXEC in scripts and some operations expect atomic outcomes.
- Multi implementation must:
  - Accumulate commands, validate up-front, and execute atomically.
  - Return `null` on transaction abort (WATCH failure or invalid command), or `[[err|null, res], ...]` otherwise.
- WATCH/UNWATCH should be plumbed to GLIDE if supported; otherwise, emulate semantics across a single connection.

Implementation adjustments:
- Confirm `Batch(true)` maps to atomic multi. Ensure WATCH keys influence exec outcome (if not natively, document limitation or emulate via optimistic checks).

### 4) Data Structure Parity (Bull keys)
- Bull uses key schemas like:
  - `:{queue}:id`, `:{queue}:wait`, `:{queue}:active`, `:{queue}:completed`, `:{queue}:failed`, `:{queue}:delayed` (sorted set), `:{queue}:prioritized` (sorted set)
  - `:{queue}:events` (pub/sub channel), `:{queue}:meta`, `:{queue}:{jobId}` (hash with state fields)
- Ensure adapter does not transform keys in ways that break expectations:
  - Respect `keyPrefix` provided by Bull and Bee-Queue.
  - Do not modify binary/string encodings; return arrays rather than `null` for getters when ioredis would return `[]`.

Implementation adjustments:
- Review `keys()` and key normalization to avoid filtering/prefix loss.
- Where our adapter might return `null`, coerce to `[]` for read APIs that ioredis returns empty arrays (e.g., range commands).

### 5) Priority and Delay Mechanics
- Bee-Queue and Bull implement delays using ZSET timestamps and polling or Lua timers; priorities via ZSET scores.
- Requirements:
  - `zadd`, `zrange`, `zrangebyscore`, `zrem`, `zremrangebyscore`, `zcard`, `zcount`, `zscore`, `zrevrange`, `zpopmin/zpopmax` parity.
  - Accurate numeric/string return types (ioredis returns numbers as strings in some cases; check our types and coerce appropriately).

Implementation adjustments:
- Audit sorted set command implementations and return types to match ioredis:
  - Score/string formatting, inclusive/exclusive ranges ("(score"), `-inf`/`+inf` handling.
  - `ZRANGE` with BYSCORE/BYLEX/WITHSCORES options used by Bull v4.

### 6) Retry and Moves Between States
- Bull relies on Lua scripts to atomically move jobs wait->active->completed/failed, update attempts, backoff, etc.
- Our `eval`/`defineCommand` must ensure scripts can read/write the expected hashes/list/zsets atomically.

Implementation adjustments:
- Verify hash commands: `hset`, `hmset`, `hget`, `hmget`, `hgetall`, `hincrby` types.
- Ensure list ops: `lpush`, `brpoplpush`, `lrem`, `lrange`, `ltrim`, `llen` match ioredis semantics.

### 7) Client Factories for Bull
- Bull passes `createClient(type)`; we must return:
  - `client` for commands
  - `subscriber` for events
  - `bclient` (blocking client) for BRPOPLPUSH (Bull v3)
- Requirements:
  - Return immediately with an object exposing ioredis API and events; connect async.
  - For `bclient`, support blocking list ops (`brpoplpush`, `blpop`, `brpop`) semantics.

Implementation adjustments:
- Ensure `duplicate()` returns a new instance that connects in the background.
- Expose a `static createClient(type, opts)` helper to wire into Bull tests.
- Implement blocking operations if missing; otherwise, add compatibility shims used by Bull (e.g., emulate with polling when GLIDE lacks blocking).

### 8) Event System Reliability
- Bull relies on keyspace notifs for some flows; primarily it uses explicit pub/sub channels.
- Requirements:
  - Pub/sub must be robust; reconnection must re-subscribe.
  - Order of events should be consistent with ioredis; avoid coalescing.

Implementation adjustments:
- On reconnect, resubscribe all `subscribedChannels` and `subscribedPatterns`.
- Ensure `message` emits string payloads unless binary requested.

## Edge Cases and Type Semantics
- ioredis often returns numbers as strings; match where libraries rely on string comparison.
- `getCompleted()` and similar getters should never return `null`; return `[]` if empty.
- `keys(pattern)` should return `[]` when no match.

## Test Acceptance Criteria
- All tests in:
  - `tests/integration/message-queues/bull-bee-queue.test.ts` pass without timeouts.
  - No `TypeError` from Bull getters (array expectations held).
  - Delayed/prioritized/retry tests pass.

## Implementation Plan (High-level)
1. Pub/Sub: harden mapping, reconnection resubscribe, ensure `message`/`pmessage` parity.
2. Scripts: finalize `eval/evalsha/defineCommand` coercions; return types normalized.
3. Multi/Pipeline: confirm atomic `Batch(true)` correctness, fix result formatting; add blocking ops support used by Bull.
4. Sorted Sets: audit and normalize all zset commands and options.
5. Arrays vs null: normalize return values for getters and scans.
6. Bull factories: provide `duplicate()` and `static createClient()` consistent with Bull expectations; ensure `bclient` behavior.
7. Add targeted tests mirroring Bull/Bee-Queue script flows if missing.

## Risks
- Valkey GLIDE differences in blocking ops or keyspace notifs; may need polling fallbacks for BRPOPLPUSH.
- Lua return type differences; must normalize.

## Done When
- All queue-related tests report green.
- No additional shims required in tests; adapter behavior alone suffices.
