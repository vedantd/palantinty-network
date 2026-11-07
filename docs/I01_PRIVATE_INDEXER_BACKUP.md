# I01a — Offline private synthetic indexer backup and no-clobber restore

**Date:** 2026-11-07. **Status:** first I01 implementation slice; does not establish production RPO/RTO, continuous backups, multi-host disaster recovery, retention/deletion, or public launch readiness.

## Why a SQLite API backup?

An indexer owns an operator-private SQLite database with signed envelopes, report metadata and replay watermarks. Copying the raw `index.sqlite` file while it is being written is not a verified snapshot procedure. We instead use Node.js 22.16+'s built-in `sqlite.backup()` API to create a transactionally consistent copy of an opened read-only source, then validate the resulting database and signed archive separately.

This feature is for **synthetic-only private operator databases**; backups contain linkable signer IDs/metadata and are NOT encrypted. Do not upload them, publish their checksums, email them, or use them with real BLE observations. Keep files under an operator-managed, restricted filesystem.

## Operator procedure

Stop `npm run operator:indexer` and ensure no other service uses or modifies its SQLite state. Create an operator-controlled private backup parent directory (mode 0700) and an **empty, private** restore parent (0700).

```bash
# Node.js 22.16+ required for node:sqlite backup()
npm run indexer:backup -- /srv/palatiny-pilot/index.sqlite /private/backup-parent/backup-2026-11-07
npm run indexer:restore -- /private/backup-parent/backup-2026-11-07 /private/recovered-indexer/index.sqlite
```

Backup refuses an existing destination directory. Restore refuses an existing file or symlink at the destination, even a dangling one. **Restore into a different, brand-new path**—never directly over a running indexer. After restore, review trusted signer configuration separately before starting any node.

The backup folder includes a 0600 `index.sqlite` snapshot and a 0600 `manifest.json` describing schema version, report/archive counts, byte length and SHA-256. It contains no raw BLE data. The manifest checksum detects accidental mismatch but is **not a signature**: a malicious operator with write access can replace both the snapshot and manifest. Private operator key material is not included in the backup.

## Validation and failure behavior

- Only the current regional SQLite schema **v2** is accepted; missing tables, future versions, failed `PRAGMA integrity_check`, foreign-key errors, malformed signed envelopes, or signed archive metadata mismatches fail closed.
- Snapshot revalidation checks each private signed envelope against accepted report ID, signer key ID, sequence, area, bucket and activity index, and verifies contributor replay watermark consistency. Legacy v1 accepted rows lacking signatures may remain, but are not fabricated as signed archives.
- File/directory permissions must be private: 0700 directories, 0600 regular files, no symlinked source or backup file. The offline pilot imposes a 1 GiB maximum database size.
- Backups synchronize the snapshot file, manifest and parent directories. A failed or interrupted backup removes its newly created backup directory; restore writes to a new temporary filename, validates it independently, and uses an atomic **fail-if-present hard-link install** to avoid overwriting a target that appears concurrently.
- Restore cannot prove that backup data was never altered by a malicious person able to change the operator's backup directory; external signed attestations, key custody, encrypted storage, retention and independent recovery audit are outside this slice.
- A directory-sync failure after restore may mean an otherwise valid target exists; **inspect manually**, do not overwrite or blindly retry. Testing an interruptible backup and a physical-host power-cut remains future I01 work.

## Tests and restrictions

`node --test tests/private-indexer-backup.test.mjs` covers round-trip aggregates, signed archive digests and replay watermarks, checksum tampering, manifest mismatch, existing target/dangling symlink refusal, unsafe permissions and corrupted source archives.

Run complete `npm test` and private Docker CI before merging. **No public Internet networking, public enrollment or real BLE sharing is enabled.** I01 remains partial pending live operator runbooks, scheduling, cross-host recovery, incremental retention, monitored RPO/RTO, crash/power-loss fault injection and incident signoff.
