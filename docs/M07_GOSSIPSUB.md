# M07 — Synthetic GossipSub slice and decision record

## Goal and scope

Replace the single common-receiver *message topology* with publish/subscribe between independently running libp2p peers. This initial slice is **synthetic and loopback-only**; it is not a deployable sensor network or proof of reliable decentralized history.

Run `npm run network:gossip` (Node 22+, `npm install`). The integration demo creates **five libp2p peer instances** (two signed synthetic contributors, one topic subscriber/relay, two distinct durable regional indexers). The peers communicate over libp2p TCP + Noise + Yamux + GossipSub; each indexer independently persists validated observations. Indexers must reconstruct the same regional result. There is no mandatory common data collector in this demonstration.

## Architectural decisions

**ADR-M07-1: Publish only signed, strict-allowlist synthetic observations.** Use the existing `pulsemesh.activity.v1` schema for compatibility, Ed25519 signature and report IDs, bounded message sizes and authorized signer checks at every receiving indexer. Coarse-area topic: `/palantiny-network/aggregate/v1/<area>`. Neither topic naming nor cryptographic keys prove physical location or contributor independence.

**ADR-M07-2: Indexers validate independently.** Each subscriber verifies the entire signed message, requires the report area to equal the subscribed area, and calls the existing regional ingestion interface. We do not accept gossip peer identity as sensor authenticity. No BLE names, MACs, raw advertisements or trajectories are transmitted.

**ADR-M07-3: Gossip delivery is not an ACK.** `publishSignedAggregate()` returns `ack:false` and `delivered:false` deliberately. Successful publishing does not guarantee every indexer received or committed a report. We have NOT yet connected the durable outbox to GossipSub. An explicit replay/anti-entropy protocol is necessary before claiming convergence during disconnection.

**ADR-M07-4: No public listeners or discovery.** The node constructor rejects any listener other than loopback. Peers are manually connected in the demo, not discovered using DHT. Remote acceptance, NAT traversal, peer scoring/rate limits, controlled bootstrap enrollment and public relay hardening are separate slices.

**ADR-M07-5: No sensor data pipeline integration.** The local macOS Palantiny diagnostic remains local. Wiring real observations to gossip requires an explicit privacy and field-calibration decision and trusted node enrollment.

## Tests and validation

`npm test` checks topic rules, malformed signatures, oversized frames, wrong-area content, replay/deduplication, no identity leakage from outcomes, and non-loopback listener rejection. CI additionally runs `npm run network:gossip` to verify peer connectivity, GossipSub fanout, independent validation and replica agreement on signed synthetic reports.

## Limitations and follow-ups

- GossipSub is **best effort**, not durable broadcast. An offline indexer misses history; DHT/discovery alone won't fix that.
- This demo includes two independent indexes but does not establish eventual convergence following interruptions.
- Peer discovery and bootstrap over the Internet are unimplemented.
- No validated sensor presence, location attestation, adversarial participant admission, calibration or anonymity guarantee.
- Participation and published data remain synthetic-only, localhost-only.

**Proposed next slice (M08):** bounded manually configured bootstrap/discovery on private test interfaces, robust reconnect lifecycle and tests for disconnection/rejoin. Do not expose a public interface until threat modeling and configuration controls are defined.

## Backwards compatibility and naming

The user-facing name is **Palantiny-Network**. Existing `pulsemesh.*` wire/schema strings remain unchanged for v1 compatibility. The GitHub repository currently uses `vedantd/palantinty-network` (typo); rename through GitHub Settings to `palantiny-network` when available. Do not silently claim the repository slug has been corrected.
