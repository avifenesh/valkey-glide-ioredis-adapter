# Code touchpoints for queue compatibility

- `tests/integration/message-queues/bull-bee-queue.test.ts` — Bull and Bee-queue scenarios
- `tests/integration/bullmq/basic-queue.test.ts` — BullMQ baseline
- `src/adapters/RedisAdapter.ts` — ioredis-compatible surface
  - `duplicate()` and static `createClient()` — Bull integration factories
  - Pub/Sub — `subscribe`, `psubscribe`, `publish`, event emitters `message`, `pmessage`
  - Lua — `scriptLoad`, `scriptExists`, `eval`, `evalsha`, `defineCommand`
  - Transactions — `multi()` via `MultiAdapter` with atomic `Batch(true)`
  - Pipelines — `PipelineAdapter` non-atomic `Batch(false)`
- `src/types/index.ts` — interfaces including `Multi`, `Pipeline`, script APIs
