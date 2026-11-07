# M09b — authenticated indexer-to-indexer synchronization

**Status: experimental / synthetic / localhost only.** This slice permits two independently operated regional indexer peers to reconcile missing signed reports even when their original contributor is offline. It is **not** public or unattended network convergence.

## Mechanism

Each regional SQLite indexer now stores the **exact signed envelope** in `signed_archive` in **the same transaction** as `accepted_reports` and the monotonic signing-key sequence watermark. The regional store advances from schema v1 to additive **v2**; complete v1 stores are upgraded transactionally. **V1 reports have no original signatures, so they remain in accepted aggregates but cannot be exchanged as signed history.** Never fabricate those signatures.

An authorized indexer exposes `/palantiny-network/indexer-sync/0.1.0`, carrying capped, cursor-based signed-envelope pages over the existing Noise-encrypted libp2p transport. The handler checks the transport's cryptographically authenticated `connection.remotePeer` against an explicitly configured allowlist, then also checks a localhost remote socket, requested region, cursor and page bounds **before** exposing anything. It does **not** trust the peer ID supplied in JSON; there is no public handler for archival data.

The requesting indexer independently pins the source Peer ID in its allowlist, validates all received envelope signatures, area and strictly ascending report IDs, and inserts using the existing durable regional ingest method. Failures stop processing. Re-running synchronization is idempotent because report IDs and signer sequences remain unique, and the indexer's ACK is issued only after a committed SQLite transaction.

### Run

```sh
npm install
npm test
npm run network:indexer-sync
```

The demonstration creates **two actual independent libp2p peers** and two separate SQLite databases. Original contributor keys sign synthetic test reports, but contributors are not connected as peers. The source retains six signed reports; the target missed two. The target retrieves small pages over encrypted libp2p, independently validates and commits the missing envelopes, verifies identical regional query results, and repeats the sync to show deduplication.

## Security and reliability decisions

- **ADR-M09b-1: Peer authentication.** Use the Noise-authenticated transport Peer ID, not a user-supplied JSON identity. Both request and response endpoints require explicit peer allowlists; the server also rejects nonloopback connections. Peer credentials do not attest geographic location or operator independence.
- **ADR-M09b-2: Archive minimally.** Indexers hold only the already permitted signed activity envelopes, never raw BLE identifiers or advertisements. Nonetheless, `signed_archive` contains **stable signer keys**, precise released report timestamps and coarse area labels, which are **linkable** and may reveal sensitive activity. This archive is private SQLite data, never part of the public dashboard or open DHT/GossipSub.
- **ADR-M09b-3: Durable atomicity.** Signed archives and accepted reports commit in one transaction. An archive write failure fails ingest, with no valid ACK and no sequence advancement. V1 archive-less accepted reports are not transmitted.
- **ADR-M09b-4: Bounded exchange.** Up to eight signed envelopes per request, with a 16 KiB message frame; up to 128 envelopes per sync invocation; timeouts and strict response schema. Lexicographically sorted report IDs provide a deterministic scan without a central indexer. No unbounded database dumps.
- **ADR-M09b-5: Partial failures.** A failed page leaves previously committed reports intact. Retrying a whole sync starts from the beginning and skips duplicates. Cursor is not persisted; this is simple and safe, not efficient for large history.
- **ADR-M09b-6: Consent and retention.** Revoking a contributor's local outbox consent cannot retract existing **independent indexer copies**. The archive introduces additional retention and revocation risk and **must not** be used for actual sensor data until a reviewed retention/deletion design and consent model exist.
- **ADR-M09b-7: No public service.** No listener other than loopback; no service for untrusted public peers, open participation or public indexer browsing. No background scheduling or proof of eventual convergence across arbitrary failures.

## Tests / gates

- New SQLite v2 initialization and v1-to-v2 upgrade, preserving legacy accepted reports.
- Injected archive insert failure, asserting accepted report/watermark rollback.
- Bounded ordered archive pagination and invalid cursor rejection.
- Untrusted peer denied before any archival query.
- Real encrypted multi-page source-to-target synchronization and repeated idempotent replay.
- Existing privacy, data-quality, local network, GossipSub, DHT, and outbox demos remain in CI.

## Limitations / next step

This is an **explicit, manual, trusted-pair sync**. It is not automatic anti-entropy scheduling or a network-wide agreement protocol. Different indexers can still diverge because of missing archives, incomplete signer allowlists, expired ingest windows, exceeding the bounded backfill gap, or offline peers. Private per-signer history also raises metadata privacy concerns.

Next small slice: **M09c** — safe resumable reconciliation with aggregate consistency summaries, signer-independent coverage comparisons and fault-injection for repeated disconnects. Then move to **M10**, a *permissioned private multi-machine synthetic test network*. Public real-sensor publishing remains blocked pending calibration and privacy review.

Naming: the public project is **Palantiny-Network**. Internal `pulsemesh.*` signed report identifiers are kept for compatibility.
