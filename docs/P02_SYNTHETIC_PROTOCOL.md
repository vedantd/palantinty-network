# P02a — separate synthetic-testnet messages and bounded ingestion

**Status:** implemented in a **localhost-only** three-peer synthetic demo. This is a protocol boundary, **not yet an open public testnet** and not an assertion that malicious participants cannot submit measurements derived from real sensors.

## Why P02a is necessary

The pre-P02 GossipSub demo reused the internal `pulsemesh.activity.v1` signed report envelope and a regional activity topic for synthetic fixtures. For an open testnet this would be an unacceptable ambiguity: untrusted test traffic must never be mistaken for verified sensing data. P02a introduces a separate public-facing **synthetic topic namespace** and payload wrapper:

```text
/palantiny-network/testnet/synthetic/v1/<coarse-test-region>
```

The wrapper has exactly four keys: `schema`, `syntheticOnly:true`, `area`, and an existing signed aggregate `envelope`. Validation checks strict UTF-8, exact field sets, signature, canonical schema, area/topic agreement, and an 8 KiB maximum frame. A sanitized observer exposes only `reportId`, coarse area, bucket start, activity index and the synthetic label; it never hands out the raw signed envelope or writes the privileged regional SQLite archive.

The in-memory limiter caps forwarded messages per connected forwarding peer over a bounded time window and bounds tracked peer keys. It is **not** Sybil resistance (an adversary can rotate peer IDs), nor a substitute for libp2p connection-manager quotas, firewall controls or peer scoring. A syntheticOnly marker is **a claim by the publisher**, not cryptographic proof of data provenance.

## Validate

```sh
npm test
npm run network:synthetic
```

The demonstration starts three independent localhost libp2p peers and propagates signed synthetic fixtures through encrypted GossipSub, recording only sanitized synthetic activity metadata. Tests deliberately inject malformed/oversized frames, unallowlisted packet fields, tampered signatures, mismatched areas and high-rate messages. No live sensor scanner is connected.

## Architectural decisions

- **ADR-P02a-1:** Synthetic-testnet traffic must be distinguishable in both its topic and its envelope schema, not merely on a dashboard label. Never mix testnet and real-sensor subscription handlers or stores.
- **ADR-P02a-2:** The testnet observer does not accept a regional-indexer `ingest(envelope)` callback or expose the original signed envelope. It reports only a bounded sanitized event. No real-data service should consume this event as verified sensing.
- **ADR-P02a-3:** Strict validation occurs **before** exposing the sanitized event. Per-peer message caps are applied before decoding JSON to limit processing from a noisy peer, but a Sybil attacker can evade per-ID limits.
- **ADR-P02a-4:** A testnet publisher can falsely mark a real-world-derived value as synthetic; the protocol alone cannot prove that it originated from a fixture generator. The true open testnet must isolate its ingestion and storage, and never publish its results as real activity.
- **ADR-P02a-5:** Keep network listeners loopback-only. Opening a public IP listener is **not authorized** by this slice. Untrusted-node admission, resource caps, DHT bootstrap security, connection flood tests, NAT traversal and incident controls remain P02 work.

## Remaining release gates

P02b: enforce bounded libp2p connection/stream resources, peer admission policy, and malicious-input network exercises. P02c: controlled public connectivity behind testnet-only isolation and a verified incident-disable plan. P03: human-friendly join/leave/revoke experience. P05–P07: physical sensor trust, privacy, calibration, retention and reviewed real-data releases.


## P02b-1 next security slice

A separate pinned localhost-only synthetic-node factory has been added, using a Noise PeerId allowlist and bounded libp2p connection/stream settings. See [P02B_PEER_ADMISSION.md](P02B_PEER_ADMISSION.md). This is **not** public admission, public transport, real sensing, or a validated hostile-network defense.


## P02b-2 application-level global limits

The isolated synthetic observer now additionally applies a fixed global per-window message/byte budget before decoding and a bounded duplicate-report memory after signed verification. See [P02B_INGRESS_BUDGET.md](P02B_INGRESS_BUDGET.md). It is not proof of public admission safety or network-wide flood resistance.
