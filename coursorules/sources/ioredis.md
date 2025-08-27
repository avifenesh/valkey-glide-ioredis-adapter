# ioredis – API points relevant to queues

- Connection & duplication: `new Redis()`, `connect()`, `disconnect()`, `duplicate()`.
- Pub/Sub: `publish`, `subscribe`/`psubscribe`, events: `message`, `pmessage`, `subscribe`, `unsubscribe`.
- Lua & custom commands: `eval`, `evalsha`, `script load/exists/flush`, `defineCommand(name, { lua, numberOfKeys })`.
- Pipelining & transactions: `pipeline()`, `multi()` with `exec()` returning `[[err|null, result], ...]` or `null` if aborted.

Citations
- ioredis API: https://ioredis.readthedocs.io/en/latest/API/
