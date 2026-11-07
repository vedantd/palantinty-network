# ADR-D02a-001 — Private synthetic Kademlia provider lookup for two indexers

**Date:** 2026-11-07 · **Stage:** experimental private D02a; **real-world network and sensing releases remain blocked**.

## Landmark demonstration

`npm run network:region-dht` starts four localhost, independently keyed libp2p peers: a discovery client, one bootstrap/router, and two indexers. The client is configured with **only the bootstrap peer's address** and a separate approved set of indexer Peer IDs. The indexer set is an authorization policy, **not a mapping of which indexer serves which region**.

The client derives a deterministic CIDv1 using `raw` codec (0x55) and a `sha2-256` multihash (0x12) of the domain-separated, canonical *fictional* region key. This CID is a **routing name**—not a real block, location proof, measurement, or record of truthful coverage. The indexers each announce that CID using libp2p Kademlia **contentRouting.provide**. The client uses **findProviders**, not `findPeer(known-id)`, to discover candidates for the region.

For each candidate:

1. Inspect the DHT-provided Peer ID; discard if not in the client's **out-of-band, operator-reviewed approved indexer set**. Never use a provider record to add its own Peer ID to this set.
2. Accept only loopback addresses, and dial the candidate by its Peer ID via libp2p's authenticated Noise transport.
3. The indexer requires the caller's Noise-authenticated Peer ID to be on its own approved client set. Requests/responses use a strict single-frame JSON line stream (`/palantiny-network/private-region-coverage/0.1.0`), bounded to 8192 bytes, with finite timeouts and two inbound streams.
4. The indexer responds with a short-lived signed coverage record using **its exact libp2p private key**. The client verifies the Ed25519 signature, its public-key-derived Peer ID, the expected authenticated remote Peer ID, the requested canonical region, and expiry. DHT addresses and coverage text alone are not proof of authorization.
5. The client succeeds only after **two unique, independently keyed indexer Peer IDs** pass validation. If a second approved indexer cannot be found, the demo fails.

No centralized region→indexer database is used. A bootstrap peer is still required to join the private sandbox and both indexers are run on the same machine for testing. **Distinct private keys do not prove different physical hosts or independent operators.**

## Security assumptions and missing work

- This demonstration is restricted to **127.0.0.1** at node creation, provider record processing, server requests and peer dialing. It does not support RFC1918 physical-host pilot links, Internet listeners, NAT/relay traversal, open enrollment or untrusted peers.
- A DHT provider record is stale/untrusted discovery metadata, not a signature, operator certificate, actual service proof, sensor location evidence or content availability guarantee. Even a signed coverage claim is only an assertion by an approved indexer; regional correctness cannot be inferred.
- The local approved indexer list is still distributed out of band, not permissionless. The example's two indexers share one test machine; independent-host H03 and six public-synthetic launch gates remain blocked.
- Provider-record expiry/refresh, churn, partition recovery, disjoint routing, eclipse/Sybil limits, abuse/load/stream controls, and listener adversarial testing are future D02b/N01 tasks.
- The D02a adapter serves *coverage only*. The subsequent D03 protocol will fetch bounded synthetic **regional aggregates** and independently compare results from two indexers. This demo does not yet query actual activity.
- Names/CIDs are fictional only, not latitude/longitude, real BLE signals, or privacy-reviewed geospatial bins. D01a is still partial.
- The existing offline Ed25519 coverage verifier in `src/private-coverage-advert.mjs` remains for historical tests. The network uses the newer libp2p identity-bound variant in `src/private-peer-bound-coverage.mjs`.

## Verification

`npm test`, `npm run network:region-dht`, and full GitHub Actions including the established local/isolated private-container suites. Only mark private D02a **partial** on a completely successful real end-to-end test; it is not done until adversarial/churn/physical-host evidence exists. No synthetic or real public-release gate should be advanced based on this demo.

## Next landmark

Authenticated read-only D03 synthetic regional aggregate query over independently discovered indexers, including disagreement detection, offline fallback and bounded data leakage, then independent-host H03. The public synthetic testnet is a **separate** 6-gate decision, and real sensing a separate 7-gate decision.
