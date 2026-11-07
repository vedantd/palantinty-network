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
| H1 | Reproducible build & dependency integrity | Checked-in package lock, `npm ci` in CI and Docker, pinned CI actions, dependency policy, SBOM and tagged build checks | Clean checkout reproducible, dependency audit, artifact integrity & vulnerability response documented | **Open; release blocker** |
| H2 | Stronger operator state lifecycle | Transactional/snapshot-safe trust revocation, key rotation with old-key tombstone, deterministic peer disconnect, idempotent rollback, concurrency and filesystem fault tests | No old key may be reauthorized via stale config; kill/rotation behavior proven after crashes | Partial: P03a–d + H0 |
| P02c exit | Two real independently administered hosts | WireGuard/private overlay, separately provisioned operator keys, pinned OS firewall rules, signed synthetic delivery, partition/restart/drift/revocation under network fault injection | Evidence from **both actual hosts**; distinct operators; reviewed logs, resource use and recovery | **Blocked; cannot be simulated away** |
| P04a | Production-style indexer recovery | Signed archive backup/restore, consistency digests, RPO/RTO targets, negative migration/partition tests | Two independent indexers converge after loss and restore without silent replay corruption | Partial prototype |
| D01 | Private geographic indexer directory | Canonical coarse-region IDs, explicit authenticated indexer coverage records (Peer ID, covered cells, expiry, protocol version, signed attestation), strict size/TTL and privacy rules | Fake/expired/wrong-area adverts refused; no precise-location leaks; dual independent local indexers | Planned |
| D02 | DHT provider lookup (private sandbox) | Use libp2p Kademlia to find indexer candidates by coarse region, verify signed advertisements against local trust policy, dial direct to indexer | Query location→region→DHT→at least 2 approved providers; bogus provider rejected; no centralized registry | Planned; sandbox Kademlia peer discovery exists |
| D03 | Authenticated query and region retrieval | Versioned read-only request/response API with bounded pages and privacy-limited synthetic regional aggregates, optional independent indexer cross-check | Equal region requests retrieve consistent synthetic data; indexer offline fallback; bounded failure and stale response logic | Planned |
| P03 public | Enrollment/operational lifecycle for **untrusted** synthetic peers | Bootstrap, opt-in/leave, abuse moderation, identity rotation, capabilities, resource control, no trusted sensor assertions | Public join/leave/ban/rejoin and faults tested; operator response owner assigned | **Blocked** |
| P02/P04 gates | Open synthetic testnet safety review | NAT/relay analysis, attack/load tests, monitoring, backups, supply chain, incident drills, independent reviewer signoff | **All six** public synthetic release gates with auditable independent evidence | **0/6 verified** |
| P05–P08 | Real sensing science and rights | Anti-Sybil/site independence, consent and withdrawal UX, field calibration, false-positive ground truth, privacy review, retention/deletion, safe aggregation and staged rollout | **All seven** real-data gates **plus** synthetic prerequisite verified; venue and legal approval | **0/7 verified** |

## Next 3 engineering PRs recommended

**1 — H1 dependency reproducibility.** Today no `package-lock.json` is committed and CI/Docker resolve transitive packages with `npm install`. Produce/review the lockfile on a trusted Node 22 machine; use `npm ci` everywhere; pin Actions and produce a dependency report. This must precede packaged public binaries or third-party operator instructions.

**2 — H2 trustworthy revocation/rotation.** Test approval changes during an active handshake and during a publish; protect ledger revisions with atomic state transitions and prevent stale config from reauthorizing a revoked peer. Revoke should close the real libp2p connection, not merely update an offline audit flag. Preserve manual operator approval; do not add a central registry.

**3 — D01 private regional indexer directory.** Establish an explicit narrow coverage-advertisement wire schema and signature/TTL rules, with negative tests. Use fictional synthetic cells only, not real sensitive locations. This is the prerequisite for location-based Kademlia discovery, **not itself a public DHT**.

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
