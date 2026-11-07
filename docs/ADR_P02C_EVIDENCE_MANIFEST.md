# ADR-P02c-002 — Offline two-host evidence manifest preflight

**Date:** 2026-11-07. **Decision:** Add an offline structural/hash checker for future independent-host synthetic pilot evidence. It is not an attestation service and does not set release gates.

The P02c blocker requires evidence from two physically independent, separately administered hosts. Local Docker and fixture logs cannot establish this. A future reviewer needs a reproducible bundle index with exact artifact hashes, distinct claimed host/operator/key identities and both host-side artifacts for baseline, partition, wrong peer, revocation, restart and recovery.

The module `src/p02c-evidence-manifest.mjs` validates a version-1 JSON object against these constraints, rejects traversal and digest mismatch, and always returns `verified:false` and `releaseGateChange:false`. It does **not** establish provenance, authenticity, operator independence, firewall isolation, physical host existence, correct timestamps, or that scenarios actually passed. A reviewer must separately inspect redacted source logs, network/firewall configuration, commands, independent signoffs and incident drills. The module reads only explicitly listed local artifacts; never upload keys, private network addresses or raw BLE data.

**Tradeoff:** Hashes detect accidental bundle modification but cannot prevent fabrication by the bundle author. The synthetic tests intentionally use fictional operator claims and are not pilot evidence. No Internet listener, real sensing or release status changes.

**Follow-up:** Independent operators gather actual host-side evidence under #67; add a separately reviewed runbook and human signoff before considering any gate transition.
