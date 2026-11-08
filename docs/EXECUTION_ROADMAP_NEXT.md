# Palantiny-network — execution roadmap after hardening

**Canonical complete slice plan:** [PUBLIC_RELEASE_EXECUTION_PLAN.md](PUBLIC_RELEASE_EXECUTION_PLAN.md), [machine-tracked dependencies and states](../config/release-execution-tracker.json), `npm run release:plan-check`. This file is the near-term priority summary.

**Updated:** 2026-11-07 · **Status:** public source / pre-public, permissioned **synthetic** network research prototype. This roadmap is an ordered engineering plan, **not** a promise that public release is near or that blocked gates have passed. Track security findings in [HARDENING_AUDIT_2026_11_07.md](HARDENING_AUDIT_2026_11_07.md) and every code decision in [ENGINEERING_EXECUTION_LOG.md](ENGINEERING_EXECUTION_LOG.md).

## End-state architecture (roles, not a central collector)

1. **Sensor/contributor (future, separate consented track):** local Palantiny input; local privacy gate creates signed *delayed, coarse* observations only after separate real-data approval. No raw BLE identities leave the device.
2. **P2P participant:** a libp2p Noise-encrypted identity, protected GossipSub topic and limited connections. It forwards reports for its approved mesh; it is **not** obliged to store all network data.
3. **Indexer:** an independently operated, opted-in service that validates and stores a subset of permitted signed reports or regional aggregates in its own archive, and can reconcile signed history with another authorized indexer. Several independent indexers may cover the same region. Private indexers exist in the synthetic prototype.
4. **Discovery client:** maps a coarse region (future canonical H3 or other reviewed scheme) to indexer coverage, discovers candidate providers, authenticates their operator identity and signed coverage advertisement, and queries them **directly**. **A DHT helps find providers; it does not store observations, verify geography or grant trust.**
5. **Regional query/publication policy:** computes relative trends from sufficient independent evidence, with sparse-cell/retention controls. Not currently ready for public or real sensor use.

## Implementation sequence

| Order | Slice / priority | Concrete engineering output | Exit criteria / evidence | State |
| --- | --- | --- | --- | --- |
| H0 | Security audit + runtime private peer enforcement | Bind P03 approval ledger to P02c pilot preflight/startup and poll for drift/revocation; test live process shutdown, repair stale docs | Unknown/candidate/revoked cannot start; running revoked node stops; full CI; ledger still blocked | **Completed, PR #64 (175/175 CI passed)** |
| H1 | Reproducible build & dependency integrity | Checked-in package lock, `npm ci` in CI and Docker, pinned CI actions, dependency policy, SBOM and tagged build checks | Clean checkout reproducible, dependency audit, artifact integrity & vulnerability response documented | **H1a merged #70 (182/182 CI); H1b open; public release still blocked** |
| H2 | Stronger operator state lifecycle | Transactional/snapshot-safe trust revocation, key rotation with old-key tombstone, deterministic peer disconnect, idempotent rollback, concurrency and filesystem fault tests | No old key may be reauthorized via stale config; kill/rotation behavior proven after crashes | **Partial**: #83 revision-checked ledger; #85 async dial/publish rechecks; #88 atomic old-key tombstone + candidate-only replacement, 222/222 CI. Independent physical-host revocation, anti-rollback and key attestation still open |
| P02c exit | Two real independently administered hosts | WireGuard/private overlay, separately provisioned operator keys, pinned OS firewall rules, signed synthetic delivery, partition/restart/drift/revocation under network fault injection | Evidence from **both actual hosts**; distinct operators; reviewed logs, resource use and recovery | **Blocked; cannot be simulated away** |
| P04a | Production-style indexer recovery | Signed archive backup/restore, consistency digests, RPO/RTO targets, negative migration/partition tests | Two independent indexers converge after loss and restore without silent replay corruption | Partial prototype; I01a offline checksum/signed-archive restore **merged #86 (217/217 CI)**, cross-host recovery/RPO/RTO not proven |
| D01 | Private geographic indexer directory | Canonical fictional region keys, authenticated indexer coverage records, reviewed Peer ID/signature binding, strict size/TTL | Two separately keyed local indexers sign and verify exactly the same canonical fictional region | **Partial**: #89 deterministic synthetic region keys, #91 libp2p identity-bound signature, #92 actual DHT integration; real geography/privacy and physical independence still unverified |
| D02 | Private DHT provider lookup and restart recovery | Region CID → signed approved indexers → direct Noise streams; private same-key new-port restart with fresh coverage | Multi-indexer query must recover after restart without reusing old endpoint proof; WAN/NAT, partitions and independent hosts remain open | **Partial**: #92 discovery and #99 private restart (full CI passed); no independent multi-host validation |
| D03 | Authenticated query and region retrieval | Signed bounded synthetic regional query, independent 2–4 responder comparison and transport-outage tolerance | Two distinct private indexers agree; one of three may stop; disagreement and bad signatures fail closed; WAN/partition recovery unverified | **Partial**: #94 and #96 merged and CI green; independent host evidence not available |
| P03 public | Enrollment/operational lifecycle for **untrusted** synthetic peers | Bootstrap, opt-in/leave, abuse moderation, identity rotation, capabilities, resource control, no trusted sensor assertions | Public join/leave/ban/rejoin and faults tested; operator response owner assigned | **Blocked** |
| P02/P04 gates | Open synthetic testnet safety review | NAT/relay analysis, attack/load tests, monitoring, backups, supply chain, incident drills, independent reviewer signoff | **All six** public synthetic release gates with auditable independent evidence | **0/6 verified** |
| P05–P08 | Real sensing science and rights | Anti-Sybil/site independence, consent and withdrawal UX, field calibration, false-positive ground truth, privacy review, retention/deletion, safe aggregation and staged rollout | **All seven** real-data gates **plus** synthetic prerequisite verified; venue and legal approval | **0/7 verified** |

## Next 3 engineering priorities (after verified D02b-1 restart milestone)

**1 — D02b-2 provider reannouncement, partition/rejoin and expiry tests.** Private #99 proved same-key indexer recovery and discovered stale DHT address hints in real CI. Extend this into bounded churn, stale cache/TTL and partition-healing evidence without weakening peer identity or publishing real sensor data.

**2 — H03 + I01/I02 independent physical-host recovery.** Deploy two separately administered hosts with distinct operators, host-owned keys and archive files; review firewall/private overlay, persistence, partition/restart, revocation and indexed-data convergence evidence. Docker or localhost alone cannot satisfy this requirement.

**3 — H01b / N01 operational security before a public synthetic testnet.** Signed artifact provenance, vulnerability triage, untrusted-peer resource/stream controls and response drills need explicit review. Do not enable open enrollment or real BLE readings prematurely.

In parallel: H01b signed release provenance and N01 untrusted-peer abuse controls. **Public synthetic gates 0/6, real gates 0/7.**

## Evidence gates and engineering discipline

Every slice should deliver:
- A statement of the threat/invariant and why the change is necessary
- Source, focused positive/negative tests, end-to-end evidence where appropriate
- GitHub CI status and merge SHA, plus failure/rollback notes
- Updated execution log, project status, roadmap, and threat model when impacted
- Confirmation that synthetic/real-data boundaries remain unchanged

Release gate states are maintained in [config/public-release-gates.json](../config/public-release-gates.json); they remain **blocked** until separately reviewed evidence is available. Avoid false confidence from a green localhost CI build, a working Docker overlay, an authenticated Noise handshake, or a DHT lookup. **Physical host independence and real sensor provenance cannot be inferred from any of those tests.**

## Practical interpretation

**What is already possible:** clone and contribute code, run private synthetic peer/indexer pilots, independently retain signed fictional report archives, sync trusted indexers, and inspect local operator configurations.

**What comes next:** making private operation truly reproducible and revocation-safe, validating real independent hosts, then enabling authenticated private location-based indexer discovery and queries.

**What we are not enabling yet:** arbitrary Internet nodes joining the network, public real-sensor sharing, persistent public location maps, verified people counts or tracking individual devices.

## Tracked, actionable blockers

- [H1 dependencies / reproducible artifacts (#65)](https://github.com/vedantd/palantinty-network/issues/65)
- [H2 transactional peer revocation (#66)](https://github.com/vedantd/palantinty-network/issues/66)
- [P02c independent physical-host evidence (#67)](https://github.com/vedantd/palantinty-network/issues/67)

Prioritize these independently verified hardening items **before** inviting untrusted synthetic participants. They do not block normal open-source code contributions.

### H1c CI policy regression guard (PR pending)

A small test-only H1 follow-up guards against accidental `pull_request_target`, writable tokens, floating Actions, `npm install`, and removal of release assertions. This is not a YAML security analyzer, a signed build, or a verified release gate. H1b supply-chain work and #65 remain open.


### P02c preparatory increment — offline evidence manifest preflight (2026-11-07)

A separate PR adds ADR-P02c-002, an offline structural and SHA-256 checker for a future two-host evidence bundle. It requires two distinct claimed operators/keys and both host-side artifacts for six private synthetic scenarios, but explicitly reports **verified: false**. This is a preparatory review aid, **not** independently administered physical-host evidence and not a release-gate transition. Actual operator execution and independent review remain blocked under #67.
