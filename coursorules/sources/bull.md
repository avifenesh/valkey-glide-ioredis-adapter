# Bull – behaviors to match

- Uses Lua scripts for atomic job moves: wait → active → completed/failed, retries, backoff, delays (ZSET), priorities (ZSET scores).
- Expects ioredis-like client factories via `createClient(type)` returning `client`, `subscriber`, and `bclient` (blocking ops).
- Pub/Sub on queue `:{queue}:events` for job state changes.
- Data schema: lists (`:wait`, `:active`), sorted sets (`:delayed`, `:prioritized`), hashes per job id, meta keys.

Adapter requirements
- `defineCommand`/`evalsha` argument conventions compatible with ioredis (flat array or KEYS/ARGV split by `numberOfKeys`).
- Correct zset semantics: `zadd`, `zrange(byscore)`, `zrem`, `zcount`, `zscore`, `zpop*`, inclusive/exclusive ranges.
- Blocking ops for `bclient` (`brpoplpush` et al.) or provide reliable fallbacks.

Citations
- Bull repo: https://github.com/OptimalBits/bull
