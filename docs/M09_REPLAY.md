# M09a — Sender-assisted signed history reconciliation

This slice closes one real reliability gap: a regional indexer can receive a **newer** signed report while missing an **earlier** sequence. Previously a strict high-water check made recovery impossible. Now we retain per-key unique sequence rows and accept an unseen, cryptographically valid older report only within a configurable `maxBackfillGap` (default 1024) and the original ingest freshness policy. The replay high watermark never decreases. Existing duplicate IDs remain idempotent, reused (key,sequence) reports are rejected. Database transaction/ACK atomicity is preserved.

A contributing node's existing SQLite outbox retains the **exact signed envelopes** after ACK. The new local-only `signedHistory({area,afterSequence,limit})` method reads a bounded, sequence-ordered slice, still requiring enabled consent. `replaySignedHistory()` transmits those originals over the pre-existing encrypted, ACK-validated libp2p direct-report protocol to an explicitly configured **loopback** regional indexer. Reports are never re-signed or altered to obtain acceptance.

## Validate

```sh
npm install
npm test
npm run network:replay
```

The three-peer synthetic integration demo:
1. Send sequences 1, 2, and 3 to indexer A.
2. Send sequences 1 and 3 to indexer B.
3. Recover sequence 2 from the contributor's retained signed outbox.
4. Verify indexer B accepts the missing sequence even after seeing sequence 3, then check both indexers have three durable reports.
5. Repeat reconciliation: every report is recognized as a duplicate; no double counting.

## ADR-M09a: bounded recovery, NOT universal anti-entropy

- We intentionally preserve per-sequence durable rows; pruning without replay tombstones/high-water design is unsafe.
- The indexer maintains `highest_sequence=MAX(old,new)`; a bounded hole-fill is permitted only for unseen sequences and within normal time/release constraints.
- `replaySignedHistory` operates on **explicitly trusted local addresses** and validates every receiver ACK. GossipSub publish is still not a durable ACK.
- Reconciliation depends on the **original contributor staying online or retaining its SQLite outbox**. An offline producer, lost outbox, and disconnected indexers can still cause permanent divergent history.
- This is a proof of a sender-assisted recovery path, **not** indexer-to-indexer anti-entropy or a distributed agreement algorithm. No public sync protocol has been exposed; a public signed report archive risks correlating signers with their data.
- The local signed-history API is not a privacy-free source of shareable contributor metadata; do not expose it over unauthenticated network interfaces.
- Not implemented: automatic missing-range detection, independently replicated signed archives, remote identity enrollment, DHT discovery, NAT traversal, or real Palantiny publishing.

**Next:** M09b indexer-to-indexer protocol with explicit trusted peer authorization, privacy review of per-signer report exchange, efficient reconciliation cursors, archival retention, and restart/failure tests. M08b public peer routing is separate and must remain sandboxed until security gates.
