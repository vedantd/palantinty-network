# ADR-D03b-001 — Private synthetic indexer outage and split-brain quorum

**Date:** 2026-11-07. **Scope:** bounded, approved-only, fictional-region D03 read protocol on localhost. **Status:** implementation and CI acceptance pending.

## Threat and failure contract

The prior D03a client always queried the first two discovered indexers. A temporary disconnection of either could prevent all reads, even when a third separately authorized and up-to-date indexer was available. Conversely, accepting an arbitrary first pair in the presence of a conflicting third would hide split-brain. We need explicit *availability* and *agreement* semantics without treating any signed BLE index as scientific truth.

## Decision

- Accept exactly **two to four** separately authenticated, D02a-verified candidate indexers (the private DHT client already caps its verified-provider count at four). Never add arbitrary candidates from the DHT to a trusted list.
- Query **every supplied candidate** in parallel over the existing bounded, signed, Noise-encrypted D03 protocol. All rows preserve the existing 15-minute delay, 24-hour window, threshold of two or more approved signed contributors, fictional names and strict schema; a zero-source response is not valid data.
- A genuinely unavailable transport (no authenticated connection, failed protocol dial, timeout or lost stream) is classified `PRIVATE_INDEXER_UNAVAILABLE`. It can be excluded **only if at least two distinct other peers return verified signed replies**. Return `degraded: true`, `unavailableCount` and the number of responding indexers.
- **Never exclude an invalid reply to manufacture consensus:** stale coverage, unapproved Peer IDs, bad signatures/nonces, malformed rows, or other non-availability faults cause a hard failure even if other peers agree.
- Compare **all** responding indexers. Exact agreement yields `consistent` (or `no-data` when all return empty); any disagreement returns `disagreement` and no aggregate rows. This is **not Byzantine consensus** and does not establish sensor authenticity or independent machines.
- If fewer than two valid, agreeing indexers remain, do not silently fall back to a single reply, cache, or zero values. Fail closed. A stopped peer's stale DHT advertisement cannot serve as current data.

## Verification and rollback

Unit tests exercise 2-of-3 transport loss, empty history, single survivor refusal, three-way split-brain, all-response comparison, duplicate IDs, stale/invalid third responses, unthresholded data, and disconnected live peer preflight. `npm run network:region-resilience` exercises five libp2p nodes on localhost: one client, one bootstrap, three independently keyed SQLite indexers. All three announce the same fictional region with private Kademlia providers. Queries initially agree, then one real indexer process is stopped, the remaining two still agree under degraded status, and a one-sided signed report triggers disagreement without publishing a consensus.

Run `npm test`, `npm run network:region-query`, `npm run network:region-resilience`, plus complete GitHub Actions and private Docker integration. To roll back, revert the D03b selection/fault-classification commit and remove the demo/CI command; no schema migration or public listener is involved.

## Residual risk / gates

A timeout can hide a malicious indexer that sends no valid response. Two responding operators can collude or share the same physical administrator, so agreement is not actual field truth or a Byzantine quorum. There is no partition-healing proof, bounded DHT republish/refresh, stable load shedding, Internet-facing NAT/relay/abuse hardening, independent physical hosts (H03), or real BLE release approval. **Do not mark D02b or D03b complete based on local CI.** All six open-synthetic and seven real-sensing public release gates stay blocked.
