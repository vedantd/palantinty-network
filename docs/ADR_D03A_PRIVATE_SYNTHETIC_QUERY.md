# ADR-D03a-001 — Bounded authenticated synthetic regional reads

**Date:** 2026-11-07 · **Status:** private synthetic-only software demonstration verified and merged in PR #94; formal D03a/D03b acceptance remains partial.

## Goal and trust boundary

D02a already discovers two independently keyed, operator-approved indexers by canonical fictional region CID using Kademlia content provider advertisements and signed, peer-ID-bound coverage. D03a reads **regional aggregates** from those verified indexers, not raw report history, identity keys, MAC/BLE identifiers, location trails or individual contributor measurements.

The network:region-query npm demo uses one bootstrap/router, two separately keyed indexers, and a querying client. Each indexer has a **separate SQLite file** with accepted **signed synthetic reports** from at least two contributor signing keys. Both indexers are on the **same host** in this test: key separation is not proof of organizational or geographic independence.

## Protocol and decisions

- The query protocol is /palantiny-network/private-synthetic-query/0.1.0, a direct libp2p stream using Noise, not a DHT or public broadcast. Candidate Peer IDs come **only** from successful D02a coverage verification and must still belong to the operator-reviewed approved set. A live loopback-authenticated connection is required.
- Each indexer requires an explicitly allowed authenticated client Peer ID, private loopback address, and a query over a **canonical fictional region**. A deterministic fictional area mapping connects the region key to the existing DurableRegionalIngest.query. There are no actual coordinates or real sensor readings.
- A client request is a single bounded JSONL frame (8 KiB), contains a fresh 128-bit nonce, and limits the window to the last 24 hours ending at least 15 minutes in the past, returning at most 16 aggregate rows.
- Only a thresholded indexer (minOperators >= 2) is eligible. All returned rows are **strictly allowlisted**: region area, time/window, 2+ signers, relative index, experimental_synthetic_only; no per-signer identity or raw archive fields. This is an implementation privacy threshold **not an anonymity proof**.
- The response is signed by the **same Ed25519 key as the libp2p node**. A domain-separated canonical signature covers region, query bounds, nonce, response lifetime and all aggregate rows. The client verifies the signer key derives the **expected Noise Peer ID** and that the ID remains operator-approved. Expired, replayed, altered, oversized, or unexpected response fields are refused.
- Both **different** approved Peer IDs must answer. Byte-for-byte row equality produces consistent; two empty archives yield **no-data**, not a zero value. Conflicting rows yield **disagreement** with no published consensus rows. Timeouts, network failure or insufficient independent replies fail closed; there is no unverified cached fallback.

## Adversarial/failure tests

Unit tests cover signed rows, substituted keys/signatures, changed values, mismatched nonces, expired responses, unacceptable row fields, insufficient threshold, invalid time range, duplicate provider IDs, disagreement and missing history. CI runs the real D02a lookup and D03a stream demo: two SQLite archives initially agree; an extra signed synthetic report is then inserted into only one indexer; the client must suppress consensus.

## Rollback and residual risks

Rollback by reverting the D03 branch/commit and removing the new CI/demo command; D02a and other private prototypes remain unchanged. No schema migration. Never expose the read service to a public IP, enable public participant enrollment, or bridge actual Palantiny scans into it.

This first D03a private read does **not** establish independently administered hosts (H03), regional accuracy, sensor independence or quality, anonymity, robust churn/refresh, partition recovery, scaling, availability SLAs, authenticated cross-host revocation, or six public synthetic release gates. A regional indexer can sign a false aggregate; independent trust and field science remain unresolved.

**Evidence:** [PR #94](https://github.com/vedantd/palantinty-network/pull/94) merged as b44caa910d1116596e9c102f2f9b7aac75eab2a1; [CI 42423722670](https://github.com/vedantd/palantinty-network/actions/runs/42423722670) and [CI 42423706799](https://github.com/vedantd/palantinty-network/actions/runs/42423706799) passed. Formal D03a/D03b are **partial**, not completed. No public testnet or real-sensing gate advanced.
