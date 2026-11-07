# ADR-H02b-004 — Atomic old-peer tombstone and unapproved replacement

**Date:** 2026-11-07 · **Scope:** private, synthetic-only P03 operator enrollment. **Not** a network-wide identity-rotation protocol.

## Decision

A private indexer/participant operator may need to replace a compromised or retired remote libp2p Peer ID. Revoking a live peer and proposing a replacement as separate file writes creates a dangerous intermediate state if the operator crashes, or the second action fails. Auto-approving a replacement would be worse: a new identity must never inherit the old ID's trust.

Implement `rotatePrivatePeer(directory,pilotId,{oldPeerId,newPeerId,remoteIp,seedAddress,expectedRevision})` as **one revision-checked ledger transaction**, using the pre-existing exclusive writer lock, validated clone, durable 0600 atomic rename and directory fsync. Preconditions:

- `expectedRevision` is **mandatory**; compare under the lock. An obsolete snapshot fails without writing.
- The old Peer ID must be **approved**, distinct from the new Peer ID, and already present in the current ledger.
- The new Peer ID must not appear anywhere in the ledger (including as a revoked tombstone). No terminal revocation record is deleted to free capacity.
- The proposed seed must bind exactly to the replacement Peer ID and an allowed explicitly private IP. All validation must happen *before* the commit.
- On success, the old entry becomes **revoked**, the replacement becomes **candidate**, and the revision increments **once**. No approval, config activation or network dial occurs.

The operator must verify the replacement independently, explicitly approve it, stage a **new** private configuration against the latest ledger revision, and then perform a separate reviewed pilot restart. The original pinned config remains in place and refuses startup after the rotation. If an existing runtime is up, its one-way trust watcher detects revision change and stops the local libp2p node when observed.

## Manual operator sequence

1. Stop the private synthetic pilot and close its host firewall, and independently obtain a new remote libp2p Peer ID, private IP and pinned seed; do **not** copy private keys or create the remote operator identity centrally.
2. Read the current ledger with `npm run peer:enrollment -- list <private-host-config.json>` and record its current revision.
3. Run `npm run peer:enrollment -- rotate <private-host-config.json> <OLD_ID> <NEW_ID> <PRIVATE_IP> <NEW_SEED> <EXPECTED_REVISION>`. The CLI refuses an old ID that differs from the currently pinned remote config.
4. Inspect the new ledger: old must be revoked, new only candidate. Independently verify the replacement identity/address.
5. Explicitly `approve` the new candidate via the existing out-of-band verification flag, obtain the latest revision, then `peer:stage` a separate new config file. The staging tool refuses an unapproved, revoked or stale-revision candidate and never overwrites the existing config.
6. Review the staged file and host firewall rules, then deliberately restart with the new config. If using the local stop marker, resume only after manual review. Keep the old Peer ID tombstone in the ledger.

**Incident fallback:** If any phase fails, keep the node stopped and the firewall closed; inspect the canonical ledger, staged config and marker before retrying. Do not roll back a revoked ID to approved. Generate another independently reviewed Peer ID instead if the replacement cannot be trusted.

## Verification and limits

Focused tests cover a single revision for revocation + candidate creation, stale review, wrong seed/IP, old==new, existing/revoked replacement, CLI configured-pin verification, one-way live guard trip, and independent approval + separate staging.

This is not a hardware anti-rollback ledger, atomic network handshake revocation, distributed revocation broadcast, remote disconnect guarantee, independent identity attestation or public enrollment. A compromised operator filesystem can restore stale ledger bytes; the watchdog is polling-based. Live physical-host revocation drills and public security gates remain open.

**Release status:** H02b remains **partial**, open synthetic **0/6** and real-sensing **0/7** gates verified. No real BLE observations are published.
