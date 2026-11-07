# M09c — automatic trusted-indexer reconciliation and coverage checks

**Synthetic, localhost-only research prototype.** Builds on [M09b's explicitly allowlisted, Noise-authenticated indexer sync](M09_INDEXER_SYNC.md). The new `createTrustedIndexerReconciler()` launches bounded sync cycles on a configurable interval and immediately when started; it is **not** a daemon in the published project.

## How it works

1. Configure the **explicit known source Peer ID and localhost multiaddress**, region, bounded interval, page size and per-round report budget. The same transport/authentication checks apply as M09b; no public discovery or new permissions.
2. Each cycle requests a small set of signed envelopes from an authorized source indexer and re-verifies and persists them in the local SQLite database. The cursor advances only after a *complete received page* is committed or recognized as a duplicate.
3. If the source disconnects or a transfer fails, the next cycle resumes from the last complete page. Reports committed before a partial-page failure are safely recognized as duplicates.
4. The scheduler prevents overlapping sync passes even if an interval elapses while a previous pass is running. `start()` and `stop()` are idempotent; stopping prevents new cycles but does **not** cancel an in-flight transaction.
5. After reaching the end of the source archive, the client requests an **authenticated, archive-only count and SHA-256 digest** of sorted report IDs, compares it with its own local archive summary, and records either `consistent` or `divergent`. On a completed pass, the cursor resets so subsequent cycles detect newly published records whose hashed report IDs sort *before* the previous cursor.

This is a **snapshot comparison of signed archive sets**, not agreement on true physical activity, identity independence, geographic claims, or retained v1 unsigned legacy records. A digest matches only if archived report-ID sets match at comparison time. Writes occurring during the scan can produce temporary divergence.

## Run and verify

```sh
npm install
npm test
npm run network:indexer-sync
npm run network:auto-sync
```

The M09c demonstration creates two indexers and ten synthetic signed reports. The target deliberately misses six. A first sync attempt encounters an unavailable handler and fails; the authorized handler then starts. Timed, bounded cycles repair all six missed reports, verify complete archive agreement, and stop cleanly. CI runs both the M09b and M09c demos.

## Architectural decisions

- **ADR-M09c-1 — Small bounded work.** Automatic cycles use `maxReportsPerRound` (1–128), `pageSize` (1–8), timeout (100–60,000 ms), and a minimum timer interval (100 ms). No unbounded archive scan or stream. Concurrency is single-flight; failed cycles return explicit status.
- **ADR-M09c-2 — Failure-safe cursor.** Cursor is kept in **process memory only** and checkpoints after a complete page. If the process crashes, a restart rescans the source from the beginning; existing durable report IDs and signing-sequence checks prevent duplication. We intentionally do **not** claim crash-durable cursor persistence or efficient recovery for large archives.
- **ADR-M09c-3 — No false consistency.** Only a completed archive pass triggers count/digest comparison. Incomplete passes return `partial`, failures return `failed`, and a mismatch returns `divergent`. Missing history cannot be concealed by a successful TCP reconnect.
- **ADR-M09c-4 — Conservative permissions.** The source must be an explicitly allowlisted, Noise-authenticated localhost peer. Digest endpoints share the same ACL as signed archive pages. No per-operator history or digest enters the public dashboard or GossipSub.
- **ADR-M09c-5 — Privacy metadata.** Even counts and hashes of signed report IDs are **linkable** metadata when combined across times or regions. Keep sync private, access-controlled and synthetic-only. A participant's local consent revocation cannot retract data retained by independent indexers.
- **ADR-M09c-6 — No universal eventual consistency guarantee.** Missing archives from pre-v2 indexer data, retention truncation, outdated report freshness, signer authorization disagreements or the limited backfill gap can prevent convergence. The runner reports failure/divergence rather than rewriting cryptographic history.

## Known remaining limitations and next steps

- The scheduler is configured inside a process; it is not yet integrated into a supervised multi-host node service. The cursor is not saved across restarts.
- The local-only indexer sync is pull-based from **one known, trusted peer**. Network-wide peer selection, avoiding eclipse/collusion, bidirectional healing, error categorization, and resource budgeting remain open.
- Snapshot digests do not prove consistency under concurrent writes, nor semantic agreement on real-world measurements.
- Actual multi-machine networking, NAT/firewall handling, robust identity provisioning, sensor calibration, consent/retention policy and public node admission are not implemented.

**Next milestone: M10.** A permissioned, independently deployed multi-machine **synthetic** test network with explicit remote connection controls, operator instructions and failure injection. Do not simply broaden the localhost listener without a threat model and network hardening.
