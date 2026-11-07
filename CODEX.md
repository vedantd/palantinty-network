# Coding-agent context — Palantiny-Network

**Start here:** [Project checkpoint](docs/PROJECT_STATUS.md) (what is
implemented, what is not, technical debt, validation gaps and pending product
decisions). Also read [README](README.md), [security notes](SECURITY.md),
[measurement quality](docs/MEASUREMENT_QUALITY.md), and
[storage recovery policy](docs/STORAGE.md).

## Naming and provenance

Canonical project name: **Palantiny-Network**. It extends the independently maintained upstream **Palantiny** project by Narasimha (@narasim-teja). Explain that relationship prominently; never imply upstream endorsement, shared ownership, or an already-public node network. Keep historical `pulsemesh.*` wire/protocol identifiers unchanged unless a separate versioned migration is approved. The GitHub repository URL may still use the old slug until its repository settings are renamed. Source: [JOIN_THE_NETWORK.md](docs/JOIN_THE_NETWORK.md) and [Excalidraw diagrams](assets/palantiny-network-overview.excalidraw).

## Current operating rules

- Research prototype; **not** a real-world deployed sensor network.
- The metric is **BLE alias activity**, not human/device/occupancy count.
- Never export raw device identifiers, advertisements, payloads or location
  trails. Respect consent, minimum thresholds, coarse areas and release delay.
- Do not connect real sensor data to P2P or a public dashboard without
  explicit privacy, security and field-validation gates.
- Keep synthetic fixture generation separate from production query logic.
- Preserve SQLite transaction/ACK atomicity, replay watermarks and
  fail-closed compatibility checks.
- Missing data is unknown, never zero. Local observed-window loss is not
  scanner uptime or regional coverage.
- Prefer small, modular, independently tested PRs; run the full CI suite
  and network demos. Update status/docs as assumptions change.
- **No incentives or tokenomics** until the core network and measured
  signal are validated.

## Pending direction

**Do not assume the next feature is approved.** First discuss with the
project owner whether to prioritize field calibration and signal validity
or a distributed end-to-end demo. The checkpoint proposes field evidence
before further infrastructure.

## M07 current slice

Synthetic-only localhost GossipSub with independent durable regional recipients is implemented in `src/gossip-network.mjs` and `apps/gossip-network-demo.mjs`; see [M07 decision record](docs/M07_GOSSIPSUB.md). Do not treat GossipSub publish success as durable delivery or real-data onboarding. Continue M08 discovery and restart hardening only after passing the five-node CI integration test.

## M09a reconciliation boundary

[Read M09 replay ADR](docs/M09_REPLAY.md). An indexer may accept a signed, unseen older sequence inside the bounded backfill gap without regressing the high-water mark. A local contributor outbox retains exact signed envelopes after ACK for encrypted, explicitly loopback sender-assisted replay. This is **not** automatic distributed anti-entropy: no raw signer's signed-history endpoint may be made public, and the publisher must retain history. Keep tests for duplicate replay, window expiry, consent revocation and transaction atomicity.

## M09b authenticated indexer synchronization

[Read M09b ADR](docs/M09_INDEXER_SYNC.md). Regional SQLite schema v2 atomically archives **exact already-accepted signed envelopes**. A trusted peer may fetch bounded pages only after an authenticated Noise Peer ID allowlist check and localhost address check. The requesting indexer independently verifies and ingests. Never expose the archive to dashboards, untrusted DHT/GossipSub peers or real sensors. V1 accepted reports without signed envelopes cannot be replicated cryptographically. This is a manually initiated local test, not automatic convergence or data-deletion support.

## M09c — automatic trusted-indexer reconciliation

[Read the M09c ADR](docs/M09_AUTOMATIC_RECONCILIATION.md). Trusted localhost indexers may automatically pull bounded pages of signed archives without duplicate ingestion and check private archive fingerprints. Cursor state is **not persisted**; retries after crashes rescan from zero. Status can be `partial`, `failed`, `consistent` or `divergent`; never equate a successful connection or archive fingerprint with validated BLE signal, independent sensor coverage or public-network safety.

## M10a — private-network sandbox only

[Read M10 private-network ADR](docs/M10_PRIVATE_NETWORK.md). Explicit `allowPrivateLan:true` allows concrete RFC1918 IPv4 interfaces for **synthetic** direct indexer sync only. The default remains loopback. Both incoming and outgoing indexer sync require a pinned Noise-authenticated Peer ID. Docker Compose runs two separate network namespaces and state volumes. A shared metadata volume in the demo is **not a secure trust bootstrap**. Public, wildcard, DNS, and real sensor publishing remain disabled; don't claim cross-physical-machine validation.

## M10b-1 persistent operator identity

[Read M10b identity/provisioning ADR](docs/M10B_OPERATOR_IDENTITY.md). Nodes persist a private libp2p Ed25519 key under a 0700 directory and 0600 key file, refuse corrupted files/symlinks, and do not silently rotate keys. Operator manifests containing a public Peer ID and RFC1918 address must be **manually verified and pinned out of band** before trusting them. The existing Docker pilot loads a persistent key from each node's separate private volume. Neither manifest nor private IP proves a physical location or authorizes public sensor data.
