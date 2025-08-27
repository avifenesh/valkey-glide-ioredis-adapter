# rate-limit-redis – integration expectations

- Works as a Store for `express-rate-limit` with Redis/Valkey.
- Options include key prefix (defaults `rl:`) and whether to reset expiry when hit count changes.
- Typical operations: `INCRBY`, `PEXPIRE`/`PTTL` to manage counters and expirations atomically/consistently.
- Expects ioredis-compatible client semantics for numeric return types and key expiry.

Citations
- Repo: https://github.com/express-rate-limit/rate-limit-redis
- npm: https://www.npmjs.com/package/rate-limit-redis
