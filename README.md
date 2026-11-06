# PulseMesh

An opt-in, privacy-first, decentralized Bluetooth activity sensing experiment.

**Status:** Experimental M01 sensor adapter. The repository contains a local
activity aggregator, a Palantiny-compatible Unix socket relay, and automated
tests. It does **not** yet contain a live libp2p network, installer, or map.

## Quick start

Node.js 22+:

```bash
npm test
npm run demo
```

Synthetic demo data only. No Bluetooth devices are scanned by these commands,
and no traffic is sent to an external server.

## Palantiny integration

The Palantiny macOS scanner sends JSONL events to the Palantiny Bun server.
PulseMesh's **local-only bridge** can forward those events without modification
while independently computing a private aggregate activity signal.

To connect a real Mac scanner, follow the
[macOS integration walkthrough](docs/PALANTINY_INTEGRATION.md).
The relay has been integration-tested with simulated Unix sockets, but
**has not yet been validated on macOS hardware**.

## Architecture

```text
Palantiny native sensor
  -> PulseMesh Unix socket relay
       | -> unchanged bytes -> Palantiny local server/UI
       | -> local parser -> activity windows -> strict privacy gate
                                      -> P2P publisher (NOT YET IMPLEMENTED)
                                      -> shared map (NOT YET IMPLEMENTED)
```

PulseMesh remains separate from [Palantiny](https://github.com/narasim-teja/palantiny).
We will propose a narrow, optional local event hook upstream only with the
author's agreement. Bluetooth device aliases are not reliable people counts.

See [roadmap](docs/ROADMAP.md) and [security](SECURITY.md).
