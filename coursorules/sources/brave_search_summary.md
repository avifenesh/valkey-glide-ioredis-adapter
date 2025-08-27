# Brave-search knowledge capture (concise)

Focus for failing tests (Bull/Bee):
- Lua scripts: rely on ioredis-compatible `evalsha`/`defineCommand` and KEYS/ARGV ordering.
- Delays/Priorities: ZSET correctness including inclusive/exclusive bounds and WITHSCORES.
- Pub/Sub: robust event emission and resubscribe.
- Client factories: `duplicate()` and `createClient(type)` returning connected-like clients immediately, connect async.
- Blocking ops: support or emulate for `bclient`.

Citations
- ioredis API: https://ioredis.readthedocs.io/en/latest/API/
- Bull: https://github.com/OptimalBits/bull
- Bee-Queue: https://github.com/bee-queue/bee-queue
- BullMQ: https://github.com/taskforcesh/bullmq/tree/master/src
- Valkey GLIDE (Node): https://valkey.io/valkey-glide/node/
