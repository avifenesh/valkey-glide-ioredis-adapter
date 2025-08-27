# Bee-Queue – behaviors to match

- Focus on speed/low overhead; delayed jobs via ZSET timestamps; events `succeeded`/`failed`.
- Typical API: `new BeeQueue(name, { redis, prefix })`, `createJob(data).save()`, `process(fn)`.
- Uses lists & zsets; relies on ioredis-compatible pub/sub and basic scripting less than Bull.

Adapter requirements
- Ensure zset delay semantics and time math; `zrangebyscore` correctness.
- Pub/Sub event delivery and reconnection resilience.

Citations
- Bee-Queue repo: https://github.com/bee-queue/bee-queue
