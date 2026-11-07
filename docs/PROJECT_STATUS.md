## D01 synthetic-only signed regional coverage checkpoint (implementation pending CI, 2026-11-07)

Ed25519 signature verification for short-lived fictional region indexer coverage, explicit locally reviewed public-key trust anchors, sorted bounded regions, tamper and expiry denial, and negative tests are proposed. This does not prove libp2p Peer ID binding, actual geographic service, or discoverability. See [D01 ADR](D01_PRIVATE_COVERAGE_ADVERTISEMENTS.md); D01a/D01b formal slices and public gates are **not** complete.

## Landing-page and progress checkpoint (2026-11-07)

The [README](../README.md) was redesigned and verified in [merged PR #78](https://github.com/vedantd/palantinty-network/pull/78) (commit `7c220db8ba46f12c7228a11cb6c6023cd1f39c28`; [CI 42399271410](https://github.com/vedantd/palantinty-network/actions/runs/42399271410), **198/198 passing tests**). It is now a concise public-facing project overview with a visual synthetic architecture, reproducible quickstart and [generated release-progress chart](../assets/roadmap-progress.svg). The [demo catalog](PROTOTYPE_DEMOS.md) links to detailed private and local experiments. The chart is derived only from the 28-slice machine tracker and blocked-by-default release ledger, not from speculative percentages.

The last verified pre-landing `main` CI run [42393874179](https://github.com/vedantd/palantinty-network/actions/runs/42393874179) passed **196 tests** plus private container suites. Recent merged changes include [#76 CI policy regression tests](https://github.com/vedantd/palantinty-network/pull/76) and [#77 offline physical-host evidence-manifest preflight](https://github.com/vedantd/palantinty-network/pull/77), neither of which certifies physical independence. **Since this landing checkpoint:** [#74](https://github.com/vedantd/palantinty-network/pull/74) was superseded by [merged PR #80](https://github.com/vedantd/palantinty-network/pull/80) (200/200 CI, fail-closed watchdog rollback tests); the signed fictional-region coverage prototype from failed/conflicted [#75](https://github.com/vedantd/palantinty-network/pull/75) is being reconstructed and repaired. It remains an offline local verification primitive—not decentralized DHT registration. No new public release gate verified; private synthetic and real-sensing release tracks remain distinct.

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
