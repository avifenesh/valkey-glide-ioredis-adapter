# Bee-Queue delays/priorities

- Delayed jobs rely on ZSET timestamps and Lua scripts (see PR discussing unpack errors on delayed raise).
- Prefix option: queues may specify `prefix`, ensure adapter preserves keyPrefix semantics.
- Events: `succeeded`/`failed` via pub/sub; requires robust subscribe/resubscribe.

Citations
- Bee-Queue: https://github.com/bee-queue/bee-queue
- PR on delayed jobs error: https://github.com/bee-queue/bee-queue/pull/123
