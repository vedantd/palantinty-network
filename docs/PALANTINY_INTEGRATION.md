# M01: Palantiny sensor integration

**Status: experimentally tested with mock Unix sockets on Linux, not yet
validated with a real macOS Bluetooth scanner.** No remote publishing.

## Why this bridge exists

Palantiny's native macOS sensor connects as a client to a local Unix socket
owned by Palantiny's Bun server. It is *not* a subscriber-readable event stream.
To reuse it without modifying the original project:

```text
Palantiny macOS sensor (.app)
       |
       v
PulseMesh local Unix socket (0600 permissions)
       |                         |
       | same original bytes     +--> private BLE-only event parser
       v                                 |
Palantiny original Unix socket         +--> local activity windows
       |                                      (no network traffic)
       v
Palantiny server + UI
```

## Mac integration procedure (manual, not yet hardware-verified)

Requirements: Node.js 22+, Bun, Palantiny checkout, macOS 14+, Xcode CLI tools.
In Palantiny's checkout, first run `bun install && bun run sensor:build`.

1. In the Palantiny checkout, start its Bun server in external-sensor mode:

   ```bash
   PALANTINY_SENSOR=external bun run server
   ```

2. In PulseMesh's checkout, start the local bridge in another terminal.
Use the actual absolute path to Palantiny's socket:

   ```bash
   node apps/palantiny-bridge.mjs \
     --listen=/tmp/pulsemesh-sensor.sock \
     --palantiny=/absolute/path/to/palantiny/data/sensor.sock \
     --area=coarse-demo-zone
   ```

   `/tmp` is only appropriate for a local manual test. Use a private
   per-user directory for actual deployment.

3. In the Palantiny checkout, explicitly launch its signed sensor app:

   ```bash
   open -n native/macos/build/palantiny-sensor.app --args \
     --socket /tmp/pulsemesh-sensor.sock
   ```

4. Open `http://127.0.0.1:4117`. The existing Palantiny interface should
continue working. Network publishing is disabled.

The first incomplete time window after starting or reconnecting is excluded.

## Guarantees and caveats

- The relay does not listen on TCP and does not publish to the internet.
- It forwards original bytes unchanged to Palantiny's existing local server.
- Only minimized local BLE events feed PulseMesh's aggregator.
- Neither the relay nor aggregation layer should log personal device IDs.
- Publishing requires a separate opt-in privacy boundary (not enabled by this app).
- A missing or disconnected upstream terminates the sensor-facing connection.
- Socket path collisions fail rather than deleting another process's socket.
- Device alias counts are not a population estimate.

## Future author collaboration

Propose a disabled-by-default local aggregate export hook in Palantiny.
An upstream hook would remove the extra relay and reduce operational complexity
without exposing private Palantiny APIs or requiring network-related changes.
