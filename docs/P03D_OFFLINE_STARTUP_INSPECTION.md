# P03d — offline private startup-readiness inspection

ADR-P03d-001 (2026-11-07): Introduce a conservative operator-only readiness inspection before considering startup-time libp2p trust integration. Reuse the existing P02c private configuration validator, P03c ledger audit, P02c emergency-stop guard and persistent operator identity reader. Require the local identity to exist and differ from the pinned remote Peer ID. Repeat configuration and audit inspection to detect some concurrent changes; do not mistake repeated reads for atomicity.

API: `inspectPrivatePilotStartup(configPath)` in `src/p03-startup-inspection.mjs`. A clean result is `readyForManualReview:true`, **not permission to start**. Unknown, candidate, revoked and drifted remote pins yield negative readiness. Missing identity, malformed config, unsafe ledger and emergency stop throw closed. The function does not create identities, clear stop markers, mutate pins or launch libp2p.

Positive and negative automated tests: `tests/p03-startup-inspection.test.mjs`. CI evidence is recorded in the execution log only after checks complete. No independent physical-host, firewall, or adversarial network validation. A race remains between inspection and manual restart; a future separate runtime-integrated guard must address it. No public listener, untrusted enrollment, real BLE input, or release-gate change.
