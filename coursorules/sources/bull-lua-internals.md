# Bull Lua internals (targets)

- Bull uses multiple Lua scripts for atomic transitions: `moveToActive`, `moveToCompleted`, `moveToDelayed`, `moveStalledJobsToWait`, retry/backoff handlers.
- Integration requirements for adapter:
  - `evalsha` must surface `NOSCRIPT` for caller retry.
  - `defineCommand` must support both variadic args and single-array style.
  - KEYS/ARGV ordering must be preserved; string coercion must match ioredis.

Citations
- Bull: https://github.com/OptimalBits/bull
