# PulseMesh

Opt-in, privacy-first Bluetooth radio activity network research.

**Status:** P0 experimental code. This branch has a synthetic local aggregator,
an explicit privacy export boundary and tests. It does NOT have BLE sensor
integration, a real P2P network, an installer, or a city heatmap.

## Quick start

Node.js 22 or later:

```bash
npm test
npm run demo
```

The demo generates synthetic BLE identifiers locally and produces an approved
aggregate report. No devices are scanned and no network connections are made.

## Planned architecture

```text
Palantiny BLE scanner (future)
    -> local-only adapter
    -> windowed activity aggregator
    -> strict privacy export gate
    -> signed report + outbox (future)
    -> libp2p network (future)
    -> regional indexer (future)
    -> public delayed heatmap (future)
```

We will build independently of [Palantiny](https://github.com/narasim-teja/palantiny)
and propose only narrow, optional integration improvements to its author.
BLE activity is NOT an estimate of unique people without calibration.

See [roadmap](docs/ROADMAP.md) and [security](SECURITY.md).
