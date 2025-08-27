# connect-redis – integration expectations

- Works as an `express-session` Store; expects ioredis-compatible client.
- TTL behavior: if session cookie has `expires`, store uses it as TTL; otherwise use `ttl` option or default.
- Prefix: `prefix` option is used to namespace session keys; adapter must respect `keyPrefix` and avoid mangling keys.
- Bulk ops (length, keys, clear) are limited to a single prefix to avoid cross-app interference.

Citations
- Repo: https://github.com/tj/connect-redis
