# Palantiny-Network · Prototype and operator demo catalog

This is the detailed index of runnable **private or synthetic-only** demonstrations. These commands do not constitute an open testnet, live crowd-counting system, or permission to publish real sensor data. See [project status](PROJECT_STATUS.md) and [release roadmap](PUBLIC_RELEASE_EXECUTION_PLAN.md).

All commands run from the repository root with Node.js 22+ after:

~~~bash
npm ci --ignore-scripts --no-audit --no-fund
npm test
~~~

| Command | What it exercises | Guide |
| --- | --- | --- |
| `npm run demo` | Offline synthetic activity aggregation | [README](../README.md) |
| `npm run network:demo` | Three-peer Noise-encrypted signed-report exchange on localhost | [Private network](PRIVATE_NETWORK.md) |
| `npm run network:durable` | Two contributor outboxes and crash-safe regional SQLite | [Durable indexer](DURABLE_INDEXER.md) |
| `npm run network:gossip` | Five-peer synthetic GossipSub mesh, including two indexers | [GossipSub](M07_GOSSIPSUB.md) |
| `npm run network:reconnect` | Disconnection and missing-message demonstration | [Reconnect](M08_RECONNECT.md) |
| `npm run network:replay` | Contributor-backed signed history recovery | [Replay](M09_REPLAY.md) |
| `npm run network:dht` | A discovers peer C through B with localhost Kademlia | [DHT](M08_DHT.md) |
| `npm run network:indexer-sync` | Private signed archive transfer and verification | [Indexer sync](M09_INDEXER_SYNC.md) |
| `npm run network:auto-sync` | Bounded automatic indexer reconciliation | [Automatic reconciliation](M09_AUTOMATIC_RECONCILIATION.md) |
| `npm run network:synthetic` | Isolated synthetic-testnet topic and strict envelopes | [Protocol](P02_SYNTHETIC_PROTOCOL.md) |
| `npm run dashboard` | Local dashboard with fictional regional aggregates | [Dashboard](DASHBOARD.md) |
| `npm run outbox:demo` | Local signed outbox and replay protection | [Signed outbox](SIGNED_OUTBOX.md) |

## Independent operator, private transport, and evidence exercises

- **Persistent operator identity and private indexer:** [P01 standalone operator](P01_STANDALONE_OPERATOR.md), [M10 private container networking](M10_PRIVATE_NETWORK.md), [restart drill](M10B_RESTART_DRILL.md).
- **Two-host private synthetic preparation:** [P01 private host setup](P01_PRIVATE_HOST_RUNBOOK.md) and [P02c independent host runbook](P02C_INDEPENDENT_HOST_PILOT.md). The scripts require independent key provisioning and out-of-band pin verification. **Actual two-physical-host signoff has not happened.**
- **Incident, enrollment and revocation:** [P02c operator controls](P02C_OPERATOR_CONTROLS.md), [P02c incident drill](P02C_INCIDENT_DRILL.md), [private peer enrollment](P03_PRIVATE_ENROLLMENT.md). These are *operator-local* protections, not a public enrollment API.
- **Build integrity:** [reproducible installs](H1_REPRODUCIBLE_BUILDS.md) and [CI provenance](H1B_CI_PROVENANCE.md). No signed public release artifact yet.

## Local macOS sensing and calibration — never network-published

Requires the separately built upstream Palantiny scanner and compatible macOS/permissions. Follow the [native integration](PALANTINY_INTEGRATION.md), [local scanner](LOCAL_SCAN.md), and [calibration protocol](CALIBRATION.md). The local scanner is **not** an independently validated people counter, and the actual sensor observations must not be transmitted over this network.

The repository is `vedantd/palantinty-network` (legacy URL spelling); the project name and npm package are **Palantiny-Network** / `palantiny-network`.
