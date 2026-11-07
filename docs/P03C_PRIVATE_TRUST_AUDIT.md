# P03c — offline private peer trust drift audit

ADR-P03c-001 (2026-11-07): Prefer a read-only reconciliation of the manually pinned P02c configuration against the P03a enrollment ledger before introducing any automated trust changes. A ledger approval does not grant live network access. The audit checks the exact remote Peer ID, pinned IP, and seed address, and flags unknown, candidate, revoked or drifted records. The ledger is a local operator assertion, not remote identity proof.

API: `auditPrivatePilotPeer(configPath)` in `src/p03-peer-audit.mjs`. It returns a bounded, structured snapshot with `consistent`, `reasons`, and `ledgerRevision`. It does not mutate any file, clear the emergency stop, activate a peer, or authorize a restart. The operator must independently verify identities and manually review all active configuration and stop markers. An audit can become stale immediately; it is not a transactional authorization check.

No public listener, automatic enrollment, real BLE ingestion, independent physical-host evidence, or public release gate change. Next: design a separate fail-closed startup reconciliation with an explicit operator opt-in and tests before considering runtime integration.
