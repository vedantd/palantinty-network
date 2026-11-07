## 2026-11-07 — P03b explicitly staged approved peer configuration

- **Starting point:** P03a (#58) green and merged. Ledger validates explicit candidate/approval/revocation but does not change running transport.
- **Decision ADR-P03b-001:** Require an operator-selected approved Peer ID and reviewed ledger revision, write a separate private config rather than dynamically changing libp2p trust.
- **Implementation:** `stagePrivatePilotPeer` checks exact revision, state, local identity, approved IP and address, private path, no overwrite, and refuses implicit LAN permission expansion. CLI stages one peer, reports `activated:false`.
- **Verification:** Tests cover candidate/revoked refusal, stale revision, no overwrite, path safety, localhost escalation, and preserving emergency-stop marker. Green CI required before merge.
- **Limitations:** No automatic application to a running node, no public registration, no independent physical-host acceptance. Operator must manually inspect, stop, review and restart.
- **Next:** P03c operator key transition/revocation reconciliation, then P03d private indexer directory with authenticated provider proof.

# Palantiny-network autonomous engineering ledger

Append new entries at the top as individual slices are completed. This file is an implementation log, **not** proof of security review or public deployment.

## 2026-11-07 — P03a local private peer enrollment

- **Starting point:** P02c-4 (#57) merged; synthetic localhost and private container tests pass; physical-host evidence and all P00 release gates remain blocked.
- **Research/inspection:** Reviewed `src/operator-provisioning.mjs`, `src/p02c-host-config.mjs`, `src/p02c-pilot-operations.mjs`, `src/synthetic-network-policy.mjs`, `docs/PROJECT_STATUS.md` and `docs/PUBLIC_PARTICIPATION_ROADMAP.md`. Existing enrollment is manually pinned, and revocation is a local stop marker; neither is public enrollment.
- **Decision ADR-P03a-001:** Establish a durable, explicit, local candidate → approved → revoked lifecycle before trying transport integration or network discovery. Approval requires out-of-band operator identity verification; no self-advertisement grants authority.
- **Implementation:** `src/p03-private-peer-ledger.mjs`, CLI, bounded file/entry validation, exclusive-writer lock and atomic on-disk revision tracking. Candidate-only state is not exported as trusted. Revoked Peer IDs are terminal.
- **Verification:** New negative/positive Node tests for state machine, bad remote addresses, seed mismatch, symlink/corrupt files, duplicate IDs and writer lock; full CI must pass before merging.
- **Explicit limitations:** This is **offline-only**; a running libp2p node still reads its separately provisioned pinned config. No multi-physical-host drill or public participation is claimed. Ledger is not a globally shared registry or anti-Sybil mechanism.
- **Next:** P03b explicit safe local pin activation and restart/rollback, then identity replacement and private indexer discovery. Leave public releases gated.

## Standing safeguards

Never copy operator keys into GitHub, open wildcard/public listeners, publish real BLE measurements, mark public release gates verified without reviewed independent evidence, or confuse signed records with trustworthy geographical/sensor provenance. Review per-slice CI and preserve decision records.
