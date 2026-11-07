# ADR-H02a-002 — Revision-checked private approval commits and durable rename

**Date:** 2026-11-07. **Status:** incremental H02a hardening for the private synthetic operator ledger; not permissionless enrollment or global revocation.

## Problem

P03 already writes a 0600 temporary file, fsyncs the file, and atomically renames it while holding a local exclusive writer lock. However, callers had no way to reject stale operator decisions based on a previous revision, and a successful rename without syncing the containing directory does not guarantee durable namespace changes after power failure.

## Decisions

- Proposal, approval, and revocation accept **optional** `expectedRevision`; it must be a nonnegative safe integer and is checked **under the writer lock** after loading current state and before mutating. Mismatch fails without writing. Existing CLI callers remain compatible.
- Prevent revision overflow past Number.MAX_SAFE_INTEGER. Revisions are scoped to the current trusted ledger, not a tamper-proof global monotonic counter.
- After fsyncing and renaming the temporary ledger, fsync the parent directory. A directory-sync error is an **ambiguous commit**: the renamed file may already be current, so an operator must inspect the canonical ledger rather than blindly retrying.
- Ignore orphan temporary files; never promote incomplete writes automatically. A stale exclusive lock after crash still requires manual review and cleanup.
- An attacker controlling operator filesystem writes can restore old ledger snapshots. A file-based revision is not anti-rollback protection. The process watchdog remains polling-based and does not provide instantaneous disconnection, revocation during a handshake, or distributed bans.

## Tests and rollback

Tests cover stale propose/approve/revoke, malformed expected revisions, revision exhaustion, and a complete-looking orphan temp snapshot. Existing ledger lifecycle, live revocation, and private networking tests remain mandatory.

No schema migration or new dependencies are introduced. Reverting the code leaves v1 ledger files valid, but removes the optional stale-revision protection and directory sync. On ambiguous I/O failure, stop operator actions and manually verify peer state and lock before restarting.

**Release status:** All six synthetic and seven real-sensor launch gates remain blocked; H02a and H02b remain partial. This is not a physical power-loss durability certification.
