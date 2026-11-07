## 2026-11-07 — P03c CI and merge evidence

- **PR:** #60 merged into `main` after review of its read-only audit implementation and positive/negative tests. Source head `2d72cc58486aa89748f9df22413136639bf8a63e`; squash merge `0a1c63cd768c2434ab4452d1b1c16b528e3bde16`.
- **GitHub Actions:** workflow `test` run `42344860645` completed **success**; `node-tests` job `128320295455` passed `npm test`, synthetic network demos, private container checks, and the public-release-gates assertion. This is CI evidence, not an independent physical-host test.
- **Decision:** keep P03c an offline diagnostic only; no runtime enrollment or automatic trust update. Follow-up should address fail-closed operator-controlled startup reconciliation in a separate slice.
- **Outstanding:** no independent physical-host evidence, no public admission, no real BLE ingestion, and all public release gates remain blocked.

## 2026-11-07 — P03c offline pinned peer trust audit (PR pending CI)

- **Starting point:** main included merged P03b PR #59; no open PRs at inspection. Reviewed P03a ledger, P03b staging, P02c host-config validator, existing tests, status and execution ledger.
- **Decision ADR-P03c-001:** Implement read-only comparison of the active manually pinned config against the local approval ledger before any runtime trust automation. See [P03C_PRIVATE_TRUST_AUDIT.md](P03C_PRIVATE_TRUST_AUDIT.md).
- **Implementation:** `auditPrivatePilotPeer` reports unknown, candidate, revoked, IP drift and seed drift without modifying files or live peers.
- **Tests:** Positive approved-pin and negative unknown/candidate/revoked/seed drift/unsafe config cases added in `tests/p03-peer-audit.test.mjs`. CI outcome must be checked before merge.
- **Blockers:** A clean audit is a staleable local snapshot, not a startup authorization or independent peer verification. No independently operated physical-host evidence; all public release gates remain blocked.

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
