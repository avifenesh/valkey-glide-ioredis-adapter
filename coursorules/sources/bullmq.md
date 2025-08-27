# BullMQ – behaviors to match

- Heavy use of Lua via `defineCommand`; passes arguments as a flat array in some paths; expects ioredis return types.
- Requires strict KEYS/ARGV handling and string/Buffer coercion similar to ioredis.
- Uses ZSETs for delayed/prioritized jobs; WITHSCORES handling.

Adapter requirements
- `eval`/`evalsha` argument normalization; `defineCommand` supporting (array) and (variadic) call styles.
- Return arrays/numbers/strings matching ioredis.

Citations
- BullMQ source: https://github.com/taskforcesh/bullmq/tree/master/src
