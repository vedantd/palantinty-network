## D02b-1 private indexer restart and fresh authenticated coverage (verified PR #99; 2026-11-07)

[PR #99](https://github.com/vedantd/palantinty-network/pull/99) merged as `6600554d3921ee5192e15542f6817146a4397b41` after [full green GitHub Actions run 42428759831](https://github.com/vedantd/palantinty-network/actions/runs/42428759831), including the five-node private Kademlia restart demo and both isolated private Docker suites. The stopped indexer reloads the **same Ed25519 identity from its private file** and reopens its **previous durable SQLite signed archive**, while listening on a changed TCP port. The existing client survives with a two-indexer quorum during the outage, then rediscovers the restarted peer by fictional regional CID, obtains fresh Noise-authenticated signed coverage and returns three matching signed regional aggregate responses. The old pre-restart connection-bound discovery snapshot is rejected.

**Important finding:** Kademlia provider address hints can remain cached/stale after reannouncement. An authenticated inbound libp2p connection may report an ephemeral source port that differs from a node's advertised listener. The implementation never treats a DHT address as authorization; it uses a fresh direct Noise-authenticated connection and signer-bound coverage proof, and binds D03 reads to that authenticated connection endpoint. [ADR](ADR_D02B_PRIVATE_PROVIDER_RESTART.md).

**Formal D02b status: partial.** Only one local machine and fictional synthetic regions were tested. This is not evidence of partition healing, NAT/relay traversal, two independently administered hosts, Byzantine resistance, sensor truth or public joinability. Synthetic launch gates **0/6**, real-sensing gates **0/7**.

## D03b private multi-indexer outage resilience (verified PR #96; 2026-11-07)

[PR #96](https://github.com/vedantd/palantinty-network/pull/96) merged as `8f1e59ccd09ecb0d36cb1065cd5edacfb7f4aff8` after both full [CI 42425997251](https://github.com/vedantd/palantinty-network/actions/runs/42425997251) and [CI 42426000888](https://github.com/vedantd/palantinty-network/actions/runs/42426000888) succeeded. A private D03 query now evaluates **all 2–4 approved, signed coverage indexers**, rather than blindly selecting the first two. A five-node same-host Kademlia/libp2p synthetic drill queries three separately keyed SQLite indexers, stops one actual libp2p node instance and still obtains a **degraded** two-indexer agreement. An injected one-sided signed report then yields `disagreement` and no consensus rows. Unauthorized or invalid signed responses remain hard errors; a lone surviving peer is insufficient. [ADR](ADR_D03B_PRIVATE_QUORUM_OUTAGES.md).

**Status: D03b stays partial.** This is not Byzantine consensus, independently administered physical hosts, outage recovery after restart, WAN/NAT, network-partition healing or truthful BLE geography. H03 external evidence and all release profiles remain blocked: synthetic **0/6**, real sensing **0/7**.

## D03a private signed regional aggregate query (verified PR #94; 2026-11-07)

[Merged PR #94](https://github.com/vedantd/palantinty-network/pull/94) added a synthetic-only read protocol after D02a's two-indexer Kademlia provider discovery. The client obtains two signed/Noise-authenticated replies from separate SQLite archives, checks the query nonce, deadline, fictional region, operator-reviewed Peer IDs, two-signer threshold, row privacy schema and signature using each indexer's libp2p identity. Identical released rows are `consistent`; empty histories are `no-data`, never zero; a deliberately divergent indexer causes `disagreement` with no consensus rows. Both full [CI run 42423722670](https://github.com/vedantd/palantinty-network/actions/runs/42423722670) and [run 42423706799](https://github.com/vedantd/palantinty-network/actions/runs/42423706799) passed, including the four-node query demo and both private-container suites. Squash merge commit: `b44caa910d1116596e9c102f2f9b7aac75eab2a1`.

**Status:** D03a and D03b move to **partial** only. Separate signing keys and SQLite files are still on **one physical host**; this is not real operator independence, production quorum availability, proof of geographic coverage, or calibrated BLE sensing. H03, churn/partition fault testing, public synthetic 0/6 and public real-sensing 0/7 remain blocked. [D03a ADR](ADR_D03A_PRIVATE_SYNTHETIC_QUERY.md).

## Private regional discovery milestone (verified PRs #91/#92; 2026-11-07)

**Achieved in local synthetic testing:** [#92](https://github.com/vedantd/palantinty-network/pull/92) uses actual libp2p Kademlia `contentRouting.provide/findProviders` to discover **two independently keyed indexers** by fictional region-derived CID. The client knows one bootstrap peer, not a central region→indexer mapping, and fetches short-lived signed coverage over a direct Noise-encrypted application stream. [#91](https://github.com/vedantd/palantinty-network/pull/91) cryptographically binds those signatures to the libp2p Peer ID and approved client/indexer policy. The full [CI 42422928287](https://github.com/vedantd/palantinty-network/actions/runs/42422928287) passed **232/232 tests**, including the four-node regional integration and private Docker suites.

**Limitations:** all four nodes shared one localhost machine; the indexers had distinct signing keys but not independently verified operators. D02a is **partial**, not public-ready. No regional activity query D03, permissionless enrollment, distributed host/network hardening, real geography, or real BLE sensor data. Public synthetic 0/6 and real-sensing 0/7 gates remain blocked. [Protocol/technical ADR](ADR_D02A_PRIVATE_REGION_PROVIDERS.md).

## D01a fictional-only canonical region routing (verified PR #89; 2026-11-07)

[PR #89](https://github.com/vedantd/palantinty-network/pull/89) merged after full [CI run 42413051412](https://github.com/vedantd/palantinty-network/actions/runs/42413051412) passed **226/226 tests** including both private Docker suites. A new strict helper generates `syn:<scenario>-cXX` canonical **fictional** regional keys, sorted coverage lists, and a domain-separated digest suitable as input to a future private DHT adapter. New tests exercise signed coverage with these generated keys. This is not a geographic coordinate mapping, proof of actual indexer location, CID/provider advertisement, real BLE model, or public network. See [D01a ADR](ADR_D01A_SYNTHETIC_REGIONS.md). D01a is **partial**; all six synthetic and seven real-sensor gates remain blocked.

## H02b private peer identity rotation (verified PR #88; 2026-11-07)

[Merged PR #88](https://github.com/vedantd/palantinty-network/pull/88) ([CI 42412549372](https://github.com/vedantd/palantinty-network/actions/runs/42412549372), **222/222 passing tests**) implements an H02b slice which rotates an approved remote libp2p identity in a single revision-checked local ledger commit: old approved ID becomes a terminal revoked tombstone; a new independently provisioned ID is only an *unapproved candidate*. CLI checks the old ID matches the current private pilot config; subsequent approval, staging and restart remain deliberately manual. Tests target stale revisions, malicious seeds, reusing old keys, runtime guard shutdown and offline staging. See [rotation ADR](ADR_H02B_PEER_ROTATION.md). **H02b remains partial**, with no public participant admission or change to release gates.

## I01 private indexer recovery prototype (verified PR #86; 2026-11-07)

An offline, operator-initiated synthetic-only SQLite backup/restore tool now uses Node's consistent SQLite backup API rather than raw file copying. It validates version 2 schema, signed archive envelopes/replay watermarks, snapshot SHA-256 manifest, private file permissions and no-overwrite restore into a new path. [PR #86](https://github.com/vedantd/palantinty-network/pull/86) merged with [CI 42406425587](https://github.com/vedantd/palantinty-network/actions/runs/42406425587) (**217/217 tests**), including private containers. See [I01 runbook](I01_PRIVATE_INDEXER_BACKUP.md). This first slice is **not** a secure distributed backup, automatic retention, cryptographic manifest attestation, live disaster recovery or proof of physical RPO/RTO; no public release gates advanced.

## H02b private asynchronous network-operation guard (verified PR #85; 2026-11-07)

The pinned, synthetic-only host pilot now rechecks operator approval immediately before and after awaited dial and publish actions, at libp2p connection-open events, and before emitting received-report evidence. Tests simulate P03 ledger revocation or pinned seed drift during an awaited network action; the local one-way guard shuts down on observed failure. [PR #85](https://github.com/vedantd/palantinty-network/pull/85) merged with [CI 42405659510](https://github.com/vedantd/palantinty-network/actions/runs/42405659510) (**212/212 tests**). See [ADR](ADR_H02B_ASYNC_TRUST_BOUNDARIES.md). This does not revoke an already transmitted packet, prove instantaneous remote disconnect, or advance the H02b/public release gates.

## H02a private trust-ledger durability checkpoint (merged PR #83; 2026-11-07)

The operator-local synthetic P03 approval ledger now accepts optional under-lock expected revisions on transitions and fsyncs the state directory after atomic rename. [PR #83](https://github.com/vedantd/palantinty-network/pull/83) merged with [CI run 42403138130](https://github.com/vedantd/palantinty-network/actions/runs/42403138130) (**209/209 tests passed**). Tests cover stale operator decisions, rejected invalid revisions, exhausted counters and simulated orphaned temporary files. See [ADR](ADR_H02A_LEDGER_CAS_DURABILITY.md). This is not an anti-rollback counter, real-time connection teardown, independent power-loss proof or public enrollment. H02a/H02b and all public release gates remain partial/blocked.

## D01 synthetic-only signed regional coverage checkpoint (merged PR #81, 2026-11-07)

Ed25519 signature verification for short-lived fictional region indexer coverage, explicit locally reviewed public-key trust anchors, sorted bounded regions, tamper and expiry denial, and negative tests have passed in [merged PR #81](https://github.com/vedantd/palantinty-network/pull/81), [CI 42401745685](https://github.com/vedantd/palantinty-network/actions/runs/42401745685) (**206/206 passed**). D01b is **partial**, not done. This does not prove libp2p Peer ID binding, actual geographic service, or discoverability. See [D01 ADR](D01_PRIVATE_COVERAGE_ADVERTISEMENTS.md); D01a/D01b formal slices and public gates are **not** complete.

## Landing-page and progress checkpoint (2026-11-07)

The [README](../README.md) was redesigned and verified in [merged PR #78](https://github.com/vedantd/palantinty-network/pull/78) (commit `7c220db8ba46f12c7228a11cb6c6023cd1f39c28`; [CI 42399271410](https://github.com/vedantd/palantinty-network/actions/runs/42399271410), **198/198 passing tests**). It is now a concise public-facing project overview with a visual synthetic architecture, reproducible quickstart and [generated release-progress chart](../assets/roadmap-progress.svg). The [demo catalog](PROTOTYPE_DEMOS.md) links to detailed private and local experiments. The chart is derived only from the 28-slice machine tracker and blocked-by-default release ledger, not from speculative percentages.

The last verified pre-landing `main` CI run [42393874179](https://github.com/vedantd/palantinty-network/actions/runs/42393874179) passed **196 tests** plus private container suites. Recent merged changes include [#76 CI policy regression tests](https://github.com/vedantd/palantinty-network/pull/76) and [#77 offline physical-host evidence-manifest preflight](https://github.com/vedantd/palantinty-network/pull/77), neither of which certifies physical independence. **Since this landing checkpoint:** [#74](https://github.com/vedantd/palantinty-network/pull/74) was superseded by [merged PR #80](https://github.com/vedantd/palantinty-network/pull/80) (200/200 CI, fail-closed watchdog rollback tests); the signed fictional-region coverage prototype in failed/conflicted [#75](https://github.com/vedantd/palantinty-network/pull/75) was repaired and merged as [#81](https://github.com/vedantd/palantinty-network/pull/81); original #75 was closed. It remains an offline local verification primitive—not decentralized DHT registration. No new public release gate verified; private synthetic and real-sensing release tracks remain distinct.

## H1b-1 immutable CI and CycloneDX SBOM (merged PR #72, 184/184 CI)

GitHub Actions now reference reviewed immutable action commits, with a read-only token, and generate a short-retention CycloneDX SBOM from the H1a lockfile. This is **not** a signed release and does not make the `release-supply-chain` gate verified. Docker image digests, vulnerability reviews, reproducible signed artifacts and incident drill remain. See [H1B_CI_PROVENANCE.md](H1B_CI_PROVENANCE.md).

## H1a reproducible synthetic pilot dependency installs (merged PR #70, 182/182 CI)

Commits Node 22 npm lockfile v3, exact integrity-pinned resolution for 131 packages, and switches GitHub Actions and both private synthetic Dockerfiles to `npm ci --ignore-scripts`. Includes offline lockfile provenance validator and negative tests, with trusted CI artifact SHA documented. This is **not** a complete supply-chain release process: immutable action/image digests, SBOM, vulnerability triage and signed release artifacts remain H1b. See [H1_REPRODUCIBLE_BUILDS.md](H1_REPRODUCIBLE_BUILDS.md). Public release gates stay blocked.

## Public-release dependency plan (2026-11-07)

A complete **28-slice** dependency-ordered plan and machine-checked tracker now span build/identity/indexer/discovery/query milestones, an independently gated **open synthetic testnet**, and a separately gated **real-sensor public launch**. Both releases are blocked; an engineering implementation is not an independent operational/rights signoff. See [PUBLIC_RELEASE_EXECUTION_PLAN.md](PUBLIC_RELEASE_EXECUTION_PLAN.md) and `config/release-execution-tracker.json`. The scheduled 2026-11-07 sprint is incremental, not a public-release deadline.

## H0 private runtime trust enforcement and targeted hardening review (2026-11-07)

The standalone P02c synthetic pilot now requires an exact **approved P03 private peer ledger entry** to pass preflight/start; active processes poll for revocation, revision/configuration drift and emergency shutdown, and close their private libp2p connections on failure. Tests cover startup refusal, ledger mutation and live process revocation. This remains operator-local best-effort enforcement, not atomic or network-wide revocation. See [HARDENING_AUDIT_2026_11_07.md](HARDENING_AUDIT_2026_11_07.md) and [EXECUTION_ROADMAP_NEXT.md](EXECUTION_ROADMAP_NEXT.md). The repository still lacks a committed dependency lockfile, independently administered host evidence, public enrollment and real-sensing review. All release gates stay blocked.

## P03d offline startup-readiness inspection (pre-public)

An offline, read-only operator inspection now checks the P03c approved pin audit, P02c emergency-stop state, and existence of a distinct persistent local identity. A clean result is **manual-review readiness only**, not permission to run. Repeated reads detect some concurrent drift but are not atomic; runtime trust remains manually provisioned. See [P03D_OFFLINE_STARTUP_INSPECTION.md](P03D_OFFLINE_STARTUP_INSPECTION.md). Physical-host evidence and public gates remain blocked.

## P03b explicit private peer staging (pre-public)

A revision-bound operator CLI now stages one **approved** P03a Peer ID into a fresh 0600 synthetic pilot config. No running node trust is modified, no emergency-stop marker cleared, and no default private LAN opt-in is expanded. See [P03_PRIVATE_PEER_STAGING.md](P03_PRIVATE_PEER_STAGING.md); public enrollment and all release gates remain blocked.

## P03a operator-local private peer enrollment (pre-public)

A standalone, strict private on-disk enrollment ledger now models candidate → approved → revoked Peer IDs with explicit out-of-band operator approval, bounded file permissions and exclusive writes. It exports only approved pinned peer data, but **does not yet change the running libp2p node's trust policy**. No public registration or geographic DHT lookup is enabled. See [P03_PRIVATE_ENROLLMENT.md](P03_PRIVATE_ENROLLMENT.md) and [ENGINEERING_EXECUTION_LOG.md](ENGINEERING_EXECUTION_LOG.md). Release gates remain blocked.

## P02c-4 synthetic outage/recovery incident drill

A bounded transcript reviewer and a multi-process localhost drill cover baseline signed synthetic receipt, publisher outage failure, fresh receipt after restart with persistent Peer IDs, revocation restart refusal, and mis-pinned publisher refusal. This is **not independently administered physical-host or firewall partition evidence**; P02c release acceptance remains blocked. See [P02C_INCIDENT_DRILL.md](P02C_INCIDENT_DRILL.md).

## P02c-3 private synthetic incident controls

An operator-local persistent emergency-stop marker, per-peer revocation marker, manual fail-closed resume, process signal shutdown and periodic bounded connection-health events now cover the standalone synthetic pilot. These are **best-effort local controls** and cannot claim a remote ban, public network resilience or independently tested physical hosts. See [P02C_OPERATOR_CONTROLS.md](P02C_OPERATOR_CONTROLS.md). Public release gates remain blocked.

## P02c-2 operator-run independent-host pilot tooling

Standalone `pilot:preflight`, `pilot:observe`, `pilot:publish`, and `pilot:review` commands use independently provisioned persistent libp2p identities, strict private config, synthetic-only reporting and offline receipt matching. A two-process localhost test covers identity reuse, receipt and offline publisher failure. **No independently operated physical-host run or VPN/firewall drill has been executed**; the release evidence ledger remains blocked. See [P02C_INDEPENDENT_HOST_PILOT.md](P02C_INDEPENDENT_HOST_PILOT.md).

## P02c-1 pinned private-overlay synthetic GossipSub

The synthetic GossipSub factory now offers **explicit RFC1918 private-overlay opt-in** requiring both independently pinned Noise Peer IDs and exact private source IPs. A separate two-container internal-bridge demo exercises encrypted GossipSub and sanitized synthetic delivery. This is **not** a public listener or proof of independently administered physical-host operation. See [P02C_PRIVATE_OVERLAY.md](P02C_PRIVATE_OVERLAY.md). Both public release profiles remain blocked.

## P02b-3 live transport abuse tests (pre-public)

Live localhost libp2p tests now exercise unauthorized Noise handshakes, stalled raw TCP connections, and a deliberately constrained test stream handler, followed by recovery to a pinned peer. These are **bounded small-scale tests, not Internet flood safety or a production security audit**. See [P02B_RUNTIME_ABUSE.md](P02B_RUNTIME_ABUSE.md); both public release profiles remain blocked.

## P02b-2 global synthetic observer budgets (pre-public)

An application-level per-window global message and byte quota now bounds synthetic observer work across rotated forwarding peer IDs. Replay IDs are remembered in a capped window, and duplicate verified reports never trigger a second observer callback. This does not cap upstream libp2p bandwidth or authenticate sensor provenance. See [P02B_INGRESS_BUDGET.md](P02B_INGRESS_BUDGET.md). Public gates remain blocked.

## P02b-1 pinned synthetic peer admission (pre-public)

An opt-in loopback-only GossipSub node factory now requires explicit, independently provisioned private keys and authorized PeerIds, with basic connection, stream and dial caps. This is distinct from the existing unrestricted local demo helper. Security and protocol tests exist but **no hostile Internet workload, independently administered host, or public participant admission is validated**. See [P02B_PEER_ADMISSION.md](P02B_PEER_ADMISSION.md). Public release gates remain blocked.

## P02a synthetic-testnet protocol boundary

An isolated synthetic GossipSub topic and strict signed envelope wrapper, sanitized observer and bounded per-forwarding-peer limiter now have adversarial tests and a localhost three-peer demonstration. **No public admission, proven synthetic provenance, Sybil resistance or real BLE input.** See [P02_SYNTHETIC_PROTOCOL.md](P02_SYNTHETIC_PROTOCOL.md).

## P01b manual private-host tooling

An offline operator preflight, public manifest generator, and synthetic-only fresh database fixture seed are available, with a private-host runbook. They enable an independently provisioned private multi-machine test when hosts are supplied, but **there is no evidence of an actual two-physical-host run**. See [P01_PRIVATE_HOST_RUNBOOK.md](P01_PRIVATE_HOST_RUNBOOK.md).

## P01a implementation checkpoint

Standalone synthetic-only indexer CLI has pre-provisioned per-operator private config, persistent libp2p identity, signed archive ACL and private Noise sync; separate-process integration tests do not use Docker coordination volumes. This is not open participation or two independently administered physical machines. See [P01_STANDALONE_OPERATOR.md](P01_STANDALONE_OPERATOR.md).

## Public launch P00 checkpoint

The open-source repository is public, but both the public synthetic testnet and real-sensing network remain **blocked** pending safety and operational gates in [the public participation plan](PUBLIC_PARTICIPATION_ROADMAP.md), [threat model](PUBLIC_THREAT_MODEL.md), and [evidence ledger](../config/public-release-gates.json). A verified release gate requires evidence and independent review; this static ledger is not a runtime authorization system.

# Palantiny-Network — engineering and product checkpoint

**Provenance and purpose:** Palantiny is Narasimha's independent local BLE sensor project. Palantiny-Network adds a separate privacy-preserving signed reporting and regional network experiment on top of compatible local sensor output. The network does **not** change Palantiny's code or imply upstream endorsement. The planned participant journey is in [JOIN_THE_NETWORK.md](JOIN_THE_NETWORK.md). Editable topology diagram: [Excalidraw](../assets/palantiny-network-overview.excalidraw).

**As of 2026-11-06.** This is a research prototype, not a live distributed
sensor network. This document is the current decision record for maintainers
and coding agents. Read it before proposing or implementing a new slice.
Source of truth remains the code and tests; verify any claims against them.

## Product hypothesis

Community-operated passive BLE sensors could produce **delayed, coarse,
relative activity trends** for places without collecting or sharing device
identifiers. The core unanswered hypothesis is whether the BLE alias signal
correlates reliably enough with independent observations to be useful across
places, times, sensors and hardware. **BLE aliases are not people**; no
occupancy, unique-device, pedestrian-count, safety or surveillance claims.

## Implemented and exercised

| Area | Current evidence | Boundary |
| --- | --- | --- |
| Local sensing | Palantiny-compatible JSONL parser, local Unix-socket relay and repeatable macOS CoreBluetooth scan CLI; prior hardware scans described in README and LOCAL_SCAN.md | Hardware exercised previously, not continuously tested in CI; no mobile/Linux sensor yet |
| Aggregation | Bounded, aligned BLE alias windows, first partial-window exclusion, incomplete-window handling | Window loss and alias-cap behavior are possible; alias churn and hardware bias uncalibrated |
| Privacy export | Explicit consent, coarse-area validation, minimum alias threshold, delayed release and field allowlist | Thresholding and delay do **not** establish formal anonymity; coarse-area trust is unresolved |
| Signed outbox | Ed25519 report signing, local SQLite queue, retries and ACK tracking | Synthetic-only; not wired to transmit real sensor observations |
| Network | Noise-encrypted private libp2p, multi-process loopback contributor-to-indexer demos, replay checks and ACK handling | No public peer discovery, public deployment, trustless onboarding or Internet threat model |
| Regional index | SQLite, minimum-contributor aggregate queries, version-1 schema guardrails, integrity checks, transaction rollback and failure-injection tests | No production retention/recovery/backup strategy, robust Sybil resistance or location attestation |
| Dashboard | Localhost synthetic five-region dashboard, independent query model, hourly aggregate-presence coverage, null gaps and guarded comparisons | Fictional geography and synthetic observations; not a live map |
| Quality | Numeric-only local diagnostics, known lost/pending window accounting and explicit unknown uptime; separate aggregate bucket availability | No verified wall-clock scan coverage, independent radio-health evidence or region-wide measurement quality |
| Calibration | Manual-count template and descriptive analysis tooling | No credible multi-site, multi-device, repeated field study or validated predictive accuracy |
| Testing | Automated unit/integration tests, failure injection, synthetic demo, network demos in GitHub Actions | CI does not test physical sensor hardware, Internet networking, adversarial Sybil attacks or statistical validity |

## Decentralization milestone (M07)

The first decentralized-message slice is being exercised: synthetic GossipSub report publication over loopback among five libp2p peers and two independently persisted indexers. It removes the single common receiver from **the test message topology**, but does not yet include discovery, offline anti-entropy, remote deployment or real Palantiny data. See [M07_GOSSIPSUB.md](M07_GOSSIPSUB.md). Earlier limitations below describe the pre-M07 topology and still apply to live-data/production readiness.

## M09b checkpoint — independent trusted-indexer signed archive sync

Regional schema v2 retains accepted signed envelopes atomically and offers bounded private pages only to allowlisted Noise-authenticated localhost indexer peers. Manual source-to-target reconciliation now works **without the original contributor staying online**, and duplicates remain idempotent. Legacy v1 accepted reports are not reconstructable as signed history. This remains synthetic, manually started, loopback-only, and insufficient for automatic or public decentralized participation. See [M09_INDEXER_SYNC.md](M09_INDEXER_SYNC.md).

## M09c checkpoint — scheduled, bounded trusted-indexer reconciliation

M09c introduces a process-local scheduler for small, authenticated indexer-to-indexer archive sync cycles, safe page-level retry, no overlapping passes, and private signed-archive count/digest consistency checks. It can repair synthetic missing history automatically after a source becomes available. **Not** crash-persistent cursor state, a public service, guaranteed convergence or real-data privacy validation. See [M09_AUTOMATIC_RECONCILIATION.md](M09_AUTOMATIC_RECONCILIATION.md).

## M10a checkpoint — private container-network integration

Private-LAN mode is opt-in, accepts only explicit RFC1918 IPv4 interfaces and pinned Noise-authenticated indexer peers, and is exercised across two isolated Docker containers with distinct storage. This validates non-loopback encrypted synthetic indexer-to-indexer reconciliation, **not** public Internet operation or independently administered physical machines. Test-only shared bootstrap metadata isn't secure real-world enrollment. See [M10_PRIVATE_NETWORK.md](M10_PRIVATE_NETWORK.md).

## Recent engineering milestones

- PR #18: transport receiver interface decoupling and pipeline loss diagnostics.
- PR #19: SQLite v1 compatibility, integrity and fail-closed schema checks.
- PR #20: synthetic fixture, schematic regions and dashboard query-model split.
- PR #21: deterministic SQLite failure-injection/transaction rollback tests.
- PR #22: hourly aggregate coverage and explicit missing-versus-zero buckets.
- PR #23: local sensor event, lifecycle and bounded-buffer loss diagnostics.
- PR #24: local measurement-quality projection; sensor uptime deliberately unknown.

These PRs are merged into main. They establish engineering *mechanisms*, not
evidence of accurate real-world activity measurement.

## Explicitly not implemented / not validated

1. End-to-end real BLE sensor -> consented signed outbox -> remote network ->
   regional index -> real geographic dashboard.
2. Reliable sensor uptime, scanner radio-state and wall-clock coverage;
   silent intervals are not presently measurable from event counters alone.
3. Independent validation against manual passage counts across multiple
   sites, times, placements and devices, including error bars and failure cases.
4. Trusted geographic location, secure sensor enrollment, resistance to fake
   identities/observations, contributor independence and sensor calibration.
5. Public P2P operations: discovery, NAT traversal, abuse/rate controls,
   operator lifecycle, observability, key rotation and incident response.
6. Formal privacy analysis for spatial/time aggregation, linkability,
   membership inference, metadata, contributor disclosure and retention.
7. Production SQLite migrations, backups, repair, compaction and replay-safe
   retention; data is not encrypted at rest.
8. Linux/Raspberry Pi/mobile sensor support, public deployment and
   real-world usability/onboarding.
9. Incentives, tokenomics or rewards. **Intentionally deferred** until the
   signal, network and participant economics are demonstrated.

## Architecture boundaries that must remain

```text
Palantiny-compatible local scanner
  -> bounded alias aggregation (raw identifiers local only)
  -> privacy/consent gate (allowlisted delayed coarse aggregate)
  -> signed SQLite outbox
  -> encrypted private transport (currently synthetic loopback only)
  -> durable regional indexer
  -> aggregate query model -> synthetic localhost dashboard
```

- No raw BLE aliases, MAC addresses, manufacturer payloads, names or
  device-level trajectories may cross the export boundary.
- The transport accepts a receiver implementing `ingest(envelope)`, not a
  concrete indexer class.
- Dashboard read logic must not create synthetic data; only its demo
  composition root may do that.
- Local quality counters and regional aggregate availability have different
  denominators and must **not** be combined into a fabricated uptime score.
- Missing observations must remain null/unknown, not zero activity.
- A failed durable transaction must not be acknowledged; preserve replay
  watermarks if designing retention.
- No real observations should enter the network before privacy and
  calibration gates are explicitly approved.

## Known engineering debts and caveats

- `ScanSession.closedWindows` is an unbounded diagnostic result array;
  bound or stream it before long-running deployments.
- Local pipeline diagnostics count observed events/windows, not silent
  intervals. A scanner can be idle or radio-disabled without proving health.
- Aggregator closed-buffer drops and pending-buffer overflow are different
  failure modes; preserve both counters.
- The dashboard is currently hard-coded as a synthetic demo, with
  experimental quality labels and schematic geography.
- SQLite bootstrap is a schema guard, not a full migration/backup framework;
  integrity-check-on-open has a cost at larger database sizes.
- Dependencies use version ranges; CI currently installs without a committed
  lockfile. Add reproducible dependency pinning before deployment.
- Replay protection, key authorization and multi-contributor thresholds do
  not solve Sybil identity, spoofed location or adversarial measurements.
- The repository has tests for implementation behavior, but not enough
  independent ground-truth or adversarial evidence for product claims.

## Product decisions needed before the next major slice

**A. What are we optimizing for?**
1. Validate a scientifically defensible *relative BLE activity index*
   at one site, or
2. Demonstrate a distributed end-to-end prototype using synthetic or
   consented test observations.

These goals imply different priorities. Do not confuse an impressive map
or networking demo with validation of the underlying signal.

**B. What is the smallest credible field study?**
Define site type, hardware, sensor placement, fixed windows, simultaneous
manual ground truth, baseline/background controls, repetitions and a
predeclared pass/fail criterion. Record negative results.

**C. What must a published region claim?**
Specify minimum independent sensors, uptime/coverage, calibration uncertainty,
privacy thresholds, freshness, and reasons to suppress a chart entirely.

**D. What is the deployment/trust model?**
Who may operate nodes? Who validates coarse area and enrollment? What
prevents fake contributors? What metadata could reveal operator locations?

## Recommended next sequence (proposal, not approved)

1. **Decision checkpoint:** agree on target use case, metric and field-study
   success criteria with the project owner.
2. **Field calibration and sensor quality:** fix long-running diagnostic
   memory bounds; add independently timed scanner/radio coverage; run
   repeatable local studies with manually counted reference events.
3. **Evidence review:** evaluate correlation, sensitivity to placement,
   background devices, time of day, missingness and uncertainty; explicitly
   decide whether BLE trends are useful enough to proceed.
4. **Only if validated:** add a privacy-reviewed real-data transport slice
   and trusted multi-node coverage/quality gates.
5. **Later:** real geographic visualization, public network hardening,
   cross-platform support, and eventually incentives.

## Development and verification

Node.js 22+. Run `npm test`, `npm run demo`,
`npm run network:demo`, `npm run network:durable`. Synthetic
`npm run dashboard` runs on localhost. Real macOS scanning requires
the separate Palantiny native build and permissions; GitHub CI cannot
substitute for field testing. See README and docs for individual workflows.

**Working agreement:** small modular PRs; meaningful failure/negative tests;
CI green before merge; update documentation when behavior or limitations
change; do not silently expand scope to public data or incentives.

H1c CI policy regression tests proposed on a separate branch; no release gate status changed. H1/#65, H2/#66, P02c/#67 remain open. Full CI required before merge.
