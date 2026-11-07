# M08a — Controlled local bootstrap and reconnection

**Scope:** A bounded, explicit connection helper for *already-known* loopback libp2p peers, not open peer discovery. `parseLocalSeed` rejects non-loopback, wildcard or unqualified address strings. `connectLocalSeed` dials a known `/ip4/127.0.0.1/tcp/<port>/p2p/<peer-id>` with a maximum number of attempts and exponential delays. It does not expose public listeners or automatically trust a peer's measurements.

**Validation:** `npm run network:reconnect` creates one synthetic contributor and two regional indexers, connects to both, publishes one report, disconnects a receiving indexer, publishes while it is offline, reconnects and publishes again. It explicitly expects the indexers to disagree by one report. This is an important **negative test**: reconnection restores a connection, but *not* missing historical GossipSub messages.

## ADR-M08a

- A known-peer address may be provisioned without a central **data** collector. Bootstrap seeds are initial contact points, not authoritative data stores.
- Loopback-only addresses remain enforced in this slice. No public DHT, mDNS discovery, relay, NAT traversal or internet service is claimed.
- Retrying a TCP dial is distinct from retransmitting an outbox message. A reconnect result must never acknowledge a published report.
- Explicit validation and bounded attempts protect against accidental connections to public or malformed peers. There are no real-data sensors connected.
- Multiple independent indexers can diverge when one is unavailable. M09 must introduce durable, authenticated report reconciliation and missingness accounting before any convergence claim.

## Next slices

**M08b**: bootstrap peer discovery and (separately) Kademlia peer routing in a sandbox with strict interface controls. **M09**: anti-entropy by signed report ID/high-water range, reconnect replay, retention and trust/authorization checks. Only after these pass can we try multi-host networking. Public Internet discovery and real sensor publishing require threat modeling, calibration and privacy gates.
