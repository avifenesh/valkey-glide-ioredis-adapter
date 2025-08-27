# Valkey GLIDE (Node) – primitives we build on

- Core classes: `GlideClient`, `Batch` (atomic=true for MULTI semantics), `Script`, `TimeUnit`.
- Pub/Sub callback delivers `{channel, payload}` (and patterns); must map to ioredis events.
- Custom command path via `customCommand([...])` and `invokeScript(script, { keys, args })`.

Adapter implications
- Use `Batch(true)` for transactions; `Batch(false)` for pipeline.
- Implement subscriber connection and resubscription on reconnect.

Citations
- Valkey GLIDE docs (Node): https://valkey.io/valkey-glide/node/
