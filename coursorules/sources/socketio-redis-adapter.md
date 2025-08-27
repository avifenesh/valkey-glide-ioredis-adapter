# Socket.IO Redis adapter expectations

- Requires separate pub and sub clients. Sub client enters subscriber mode; non-subscriber commands on sub client error (must use pub for normal commands).
- `createAdapter(pubClient, subClient)` assumes ioredis-compatible clients with `duplicate()` often used to create separate clients.
- Known issues if using single client for both modes.

Citations
- Repo: https://github.com/socketio/socket.io-redis-adapter
- Issue (subscriber mode): https://github.com/socketio/socket.io-redis-adapter/issues/274
