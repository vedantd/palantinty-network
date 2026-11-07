# SQLite storage compatibility (prototype)

The contributor outbox and regional indexer use a shared, versioned SQLite
bootstrap in `src/sqlite-schema.mjs`. New stores start at schema version 1
(`PRAGMA user_version`). Existing complete unversioned stores are upgraded
transactionally to v1 without dropping rows. Incomplete legacy schemas,
future versions and failed integrity checks are rejected rather than silently
repaired. The outbox and indexer remain **separate databases**.

This is an additive compatibility guard, **not** a general migration engine.
The database schema is not currently encrypted. Do not copy sensitive real
observations into the synthetic indexer.

## Recovery policy

- Never automatically overwrite, delete, or rebuild a failed database.
- Stop the affected node and preserve the original database for offline
  diagnosis. SQLite `integrity_check` failure is not proof that recovery is
  possible; restore from a known-good backup if necessary.
- A crash before transaction commit must not produce a delivery ACK.
- `user_version > 2` requires a compatible application release; regional indexes currently use v2 and outboxes use v1.
- Do not introduce retention by deleting accepted report IDs without designing
  durable replay tombstones and contributor sequence watermarks.
- A future release should add explicit migration functions, backup-before-
  migrate, testable downgrade refusal, and periodic integrity verification.

## Validation

`npm test` includes clean initialization, restart, unknown future version,
incomplete legacy schema and corrupted SQLite cases for both stores. The
existing durable network demo checks that signed report ACKs survive indexer
restart. No physical hardware is needed.

## M09b addendum — regional signed archive v2

Regional SQLite schema v2 adds `signed_archive(report_id,area,envelope)`; ingest writes it atomically with reports and contributor replay watermarks. The additive v1-to-v2 upgrade does **not** produce archives for old accepted rows. Such records remain queryable but cannot participate in cryptographically verifiable indexer-to-indexer history recovery. This archive increases metadata retention risk; keep databases private and synthetic-only. See [M09_INDEXER_SYNC.md](M09_INDEXER_SYNC.md). Outbox schema remains v1. Unsupported future schema versions still fail closed.


## I01a offline private synthetic indexer backup/restore (merged #86, 2026-11-07)

Use `npm run indexer:backup -- <absolute-existing-index.sqlite> <absolute-new-private-backup-directory>` and `npm run indexer:restore -- <absolute-existing-backup-directory> <absolute-new-index.sqlite>` only for a **stopped synthetic-only** indexer. The Node.js 22.16+ built-in `sqlite.backup()` API produces a database-consistent snapshot; SHA-256 and signed-archive integrity checks detect accidental mismatches, and a new-file-only hard-link install refuses overwrite. There is **no encrypted/attested offsite backup, scheduled snapshot, RPO/RTO signoff, real sensor network or public access**. Full requirements and limitations: [I01 private runbook](I01_PRIVATE_INDEXER_BACKUP.md).

**Verification:** [#86](https://github.com/vedantd/palantinty-network/pull/86), [CI 42406425587](https://github.com/vedantd/palantinty-network/actions/runs/42406425587) — 217/217 passing tests, including full private Docker suites. I01 remains partial; no independent physical-host restore has been attested.
