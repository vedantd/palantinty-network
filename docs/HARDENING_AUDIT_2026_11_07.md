# Hardening audit — 2026-11-07

**Scope:** targeted review of the current **private synthetic** P02c/P03 operator flow, not an independent security audit or a public-launch signoff. Based on direct inspection of source, tests, GitHub Actions, and release gate ledger. Repository remains publicly readable but not joinable as a public peer network.

## Findings and disposition

| ID | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| H-001 | High | P03a approval, P03c audit and P03d startup inspection were advisory; the P02c host pilot could start with an unknown/candidate/revoked remote in its manual config | **Hardened in this PR:** approved ledger mandatory at preflight and startup; live revocation/drift closes libp2p; real-process tests. Best-effort polling, not atomic revocation |
| H-002 | High | No committed npm lockfile; CI and Docker build run `npm install` with floating transitive versions. Builds are not reliably reproducible | **Open:** generate and review `package-lock.json`, switch CI/Docker to `npm ci`, verify clean checkout, add dependency/SBOM checks before distribution |
| H-003 | High | No independent two-physical-host or VPN firewall partition evidence; localhost processes and Docker bridge may mask cross-host behavior | **Open:** two independently administered hosts, pinned trust, packet capture / firewall evidence, revocation and outage drill reviewed by a second operator |
| H-004 | High | Live trust checks have polling and filesystem TOCTOU windows; malicious host or blocked event loop can continue briefly | **Partially mitigated:** startup recheck and watcher; **open:** transactional generation control, resource-manager guard, immediate peer disconnect under tested conditions, host firewall kill |
| H-005 | Medium | Local approval is operator assertion only: no remote identity challenge beyond libp2p Noise, no anti-Sybil proof or location attestation | **Open by design:** independent operator identity and sensor/site provenance before real-data claims |
| H-006 | Medium | Peer admission and abuse controls tested at bounded local scale, not under untrusted Internet churn, NAT/relay failures or DDoS conditions | **Open:** adversarial simulation plus resource budgets, metrics, fault-injection recovery and operator incident runbook |
| H-007 | Medium | Documentation had old `vedantd/pulsemesh` GitHub links and did not explain mandatory enrollment | **Hardened in this PR:** canonical GitHub links and updated P02c/P03 operator runbook, status/roadmap tracking |
| H-008 | Medium | Public geographic DHT indexer-provider discovery is conceptual; current sandbox DHT demo is not a trusted location query service | **Open:** authenticated, TTL-bounded coarse-region provider records with private validation first; never treat DHT as trust or a data store |
| H-009 | Medium | No full indexer backup/restore drill, recovery point objective, key-loss and indexer divergence on two remote hosts | **Open:** P04 recovery and disaster drill with archived signed histories |
| H-010 | Medium | No independently reviewed privacy, retention, consent, calibration, or real sensor field protocol | **Open:** separate P05–P08 real-sensing track; no real BLE network input |

## Security invariant after this PR

The standalone operator-run **P02c private synthetic pilot** must have a valid P03 enrollment ledger in its 0700 private operator state directory. Its configured remote Peer ID and exact source IP + seed must be in **approved** state before `preflight`, `observe`, or `publish` can succeed. The process polls its local trust inputs, including the ledger revision, full private configuration fingerprint, and emergency-stop marker, approximately every 100 ms. Any observed revocation, revision change, missing/corrupt ledger, changed config, or stop request fails closed. The node must be restarted deliberately after review; changes never auto-enable a new peer.

**Limits:** file polling is not a kernel firewall, atomic authorization, cross-machine peer revocation, network-wide ban or cryptographic operator attestation. It can lag, and cannot guarantee enforcement if the process hangs or the host is compromised. Host-level firewall closure remains the incident authority. Existing private Docker demos and legacy API helpers are **not** converted into public enrollment services.

## Audit and evidence discipline

For every future slice, include explicit risk hypothesis, small patch, positive/negative tests, GitHub CI run ID, ADR in engineering log, issue or decision for uncovered gaps, manual multi-host evidence if required, and precise release-gate status. New code merged into `main` is not automatically a passed release gate.

Evidence status remains **0/6 synthetic public-release gates** and **0/7 real-sensing gates**. Review the machine-readable [release ledger](../config/public-release-gates.json) before any launch announcement.
