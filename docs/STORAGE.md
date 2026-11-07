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
- `user_version > 1` requires a compatible application release.
- Do not introduce retention by deleting accepted report IDs without designing
  durable replay tombstones and contributor sequence watermarks.
- A future release should add explicit migration functions, backup-before-
  migrate, testable downgrade refusal, and periodic integrity verification.

## Validation

`npm test` includes clean initialization, restart, unknown future version,
incomplete legacy schema and corrupted SQLite cases for both stores. The
existing durable network demo checks that signed report ACKs survive indexer
restart. No physical hardware is needed.
