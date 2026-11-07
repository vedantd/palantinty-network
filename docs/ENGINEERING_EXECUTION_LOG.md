## 2026-11-07 — D03a authenticated synthetic aggregate quorum (verified PR #94)

- **Design:** Extend D02a fictional CID provider discovery into a private read-only, Noise-authenticated D03 protocol. Require two distinct approved Peer IDs and current peer-bound coverage. The indexer signs the response's request nonce, region, bounds, expiry and aggregate rows with its **own** libp2p Ed25519 key.
- **Privacy:** 8 KiB frames, at most 16 rows, 24-hour lookback ending at least 15 minutes ago, 2+ separate signed contributors per bucket, strictly allowlisted aggregate schema. Never expose raw signed archives, signer IDs, device identifiers or real BLE data. Empty readings stay unknown.
- **Verification:** Unit adversarial tests for forged signature/key/peer, tamper, wrong nonce, expiry, early/unthresholded bucket, duplicate indexer, invalid range and schema; end-to-end four-node demo exercises two separately keyed SQLite archives, agreement, no-data and explicit one-sided divergence refusal. [PR #94](https://github.com/vedantd/palantinty-network/pull/94) merged as `b44caa910d1116596e9c102f2f9b7aac75eab2a1`; full green [CI 42423722670](https://github.com/vedantd/palantinty-network/actions/runs/42423722670) and [CI 42423706799](https://github.com/vedantd/palantinty-network/actions/runs/42423706799), both private-container suites included. [ADR](ADR_D03A_PRIVATE_SYNTHETIC_QUERY.md).
- **Residual and next:** D03a/D03b **partial** pending churn/partitions and actual independent-host testing (H03). No automatic fallback to a single indexer, no public listeners, no sensor truth, no real geography. All 6 synthetic and 7 real-data launch gates remain blocked; no public deployment assertion.

## 2026-11-07 — D02a real private Kademlia region-to-two-indexer demonstration (verified PR #92)

- **Actual goal:** replace known-peer-ID `findPeer` routing with `contentRouting.provide/findProviders` for a canonical fictional region CID. Four separately keyed localhost peers: client, bootstrap, indexer A and B; client knows only bootstrap address and a separately approved set of indexer Peer IDs.
- **Direct query:** require two unique provider records, Noise-encrypted direct coverage protocol, both signed with *the provider's own* libp2p Ed25519 key. Reject candidates outside local allowlist, private-network violations, mismatched signer/Peer ID/region/TTL.
- **Acceptance:** `npm run network:region-dht` fails if either signed/indexer stream fails; also rejects trying to satisfy 2-indexer confidence with a single approved key. Script added to CI, in addition to CID/policy unit tests. [ADR](ADR_D02A_PRIVATE_REGION_PROVIDERS.md).
- **Boundaries:** only loopback, fictional regions and private operators; distinct generated keys do not prove distinct people/machines. No activity-query D03 yet, no public participation or BLE publishing.
- **CI/merge:** [PR #92](https://github.com/vedantd/palantinty-network/pull/92) merged as `f3409f369fa577747d6896e753782e6494a657f6` after full green [run 42422928287](https://github.com/vedantd/palantinty-network/actions/runs/42422928287): **232/232 tests passed**, including the `network:region-dht` four-node two-indexer verification and both private Docker suites. Formal D02a is **partial**, H03 external proof and both launch profiles unchanged.

## 2026-11-07 — D01b libp2p Peer ID-bound fictional coverage signatures (verified PR #91)

- Replaces *separate-key trust assertion* in future private DHT discovery with signatures from the indexer's own libp2p Ed25519 identity. A verifier derives the signer Peer ID from the advertised public key and cross-checks it against both the Noise-authenticated stream peer and a local operator-reviewed allowlist.
- Canonical versioned D01 synthetic coverage payload, domain-separated signature, bounded base64 fields, 15-minute lifetime, strict fake-region validation; no real location semantics.
- Tests reject wrong signer, replaced public key/signature, unauthorized peer ID, wrong region, legacy fictional routing key, invalid fields and expired advert. [ADR](ADR_D01B_PEER_ID_BOUND_COVERAGE.md).
- At the time of this slice, the peer-bound signer did not perform Kademlia registration; that has now been implemented in #92. Independent hosts, public launch, and BLE data remain blocked. D01b stays **partial**.
- **CI/merge:** [PR #91](https://github.com/vedantd/palantinty-network/pull/91) merged as `77998350b3c46570030699c433c67af4c86b81d4`, [run 42422478688](https://github.com/vedantd/palantinty-network/actions/runs/42422478688) passed **229/229 tests**, private Docker green.

## 2026-11-07 — D01a canonical fictional region routing keys (verified PR #89)

- **Scope:** deterministic local fictional region identifiers only, with a bounded scenario/cell index and a domain-separated SHA-256 digest for a future private DHT adapter. No real-location lookup or sensor ingestion.
- **Implementation:** `syntheticRegionKey`, `parseSyntheticRegionKey`, `syntheticCoverageRegions`, `syntheticRegionRoutingDigest`; strict extra-field refusal, 64 bounded cells per fictional scenario and sorted maximum 16 coverage records.
- **Integration:** existing D01b private Ed25519 coverage adverts accept generated keys; legacy `syn:fictional-a` examples remain supported by the old offline signing protocol, but are not canonical routing keys. [ADR](ADR_D01A_SYNTHETIC_REGIONS.md).
- **Tests:** deterministic round-trip, malformed geolocation/coordinate rejection, coverage signing/verifying, stable domain-separated routing keys; full [GitHub Actions run 42413051412](https://github.com/vedantd/palantinty-network/actions/runs/42413051412) **passed 226/226 tests**, including P02c/M10 private Docker integration. [PR #89](https://github.com/vedantd/palantinty-network/pull/89) merged as `3b4b8451220c6b518c7afc91dc7b7a9aff974dfe`.
- **Residual:** only fictional region keys and non-secret digests; real coarse-grain geography, signed libp2p identity binding, DHT provider semantics, independent indexer participation and all launch gates remain unsolved. D01a **partial**, public synthetic 0/6 and real 0/7.

## 2026-11-07 — H02b private old-ID tombstone and candidate-only rotation (verified PR #88)

- **Context:** Previous [#85](https://github.com/vedantd/palantinty-network/pull/85) added pre/post-await private dial and publish approval checks; [#83](https://github.com/vedantd/palantinty-network/pull/83) added revision-checked ledger mutations and durable rename. H02b remains partial.
- **Invariant:** retiring an approved remote libp2p Peer ID must never result in implicit approval of a replacement or re-admission of the old ID. The previous separate revoke + propose steps can be a single controlled state transition.
- **Implementation:** `rotatePrivatePeer` requires the current `expectedRevision` under exclusive lock, changes old approved to a terminal revoked tombstone and appends a validated new *candidate*, committing once. CLI checks old matches current pinned remote. New identity still needs independent verification, explicit approval, fresh revision-bound staging and manual restart.
- **Tests:** atomic one-revision swap, stale/wrong/previously revoked replacement refusal, runtime guard one-way trip, new candidate cannot be staged, later approval and separate staged config, and CLI old-ID check. [ADR](ADR_H02B_PEER_ROTATION.md) captures recovery/runbook and limits.
- **Residual:** no live, independently administered machine rotation; polling remains best-effort; file anti-rollback, signed operator attestation, remote network bans and public enrollment remain unsolved. No public release gate promoted.
- **CI/merge:** [PR #88](https://github.com/vedantd/palantinty-network/pull/88) merged as `ef69597205f223636973a8de7c76971b69ce70a2` after full [CI run 42412549372](https://github.com/vedantd/palantinty-network/actions/runs/42412549372): **222/222 tests passed**, including private Docker suites. H02b remains **partial**; public release gates unchanged.

## 2026-11-07 — I01a private synthetic indexer backup/restore prototype (verified PR #86)

- **Starting point:** [#85](https://github.com/vedantd/palantinty-network/pull/85) merged to improve private dial/publish authorization rechecks; H02b remains partial. Start I01 offline snapshot/recovery without opening public networking.
- **Failure model:** a raw copy of a changing SQLite file is not a verified consistent recovery point; restoration must not overwrite a running indexer and accidental snapshot corruption must be detected.
- **Implementation:** Node 22.16+ SQLite backup API, private 0600 snapshot plus checksum/counters manifest, signature/SQL integrity verification, complete signed envelope to accepted-row checks, no-clobber hard-link restore to a fresh path.
- **Tests:** signed synthetic report/aggregate replay recovery, corrupted snapshot and manifest refusal, existing target and dangling symlink denial, schema/permission refusal. [Runbook and residual risks](I01_PRIVATE_INDEXER_BACKUP.md).
- **Residual:** backup not encrypted or cryptographically authenticated by operator, no periodic retention or cross-host restore, physical power-loss testing or monitored RPO/RTO. I01 will be **partial** if CI passes; both public launch profiles blocked.
- **CI/merge:** [PR #86](https://github.com/vedantd/palantinty-network/pull/86) merged as `a3ce5d37c14e4ec739683cec729b83d53cc9de20` after complete green [CI run 42406425587](https://github.com/vedantd/palantinty-network/actions/runs/42406425587): **217/217 tests passed** and private Docker integrations green. I01 is **partial**; no real-host recovery or release gate approval.

## 2026-11-07 — H02b private async-operation trust rechecks (verified PR #85)

- **Starting point:** #83 H02a optional expected-revision CAS and durable directory rename merged with 209/209 CI. Still open #66 for live revocation, rotation and handshake/publish races.
- **Risk:** an approved publisher could dial/publish after local revocation changed while the operation was awaiting a network response. An observer could report a received report after trust drift.
- **Change:** add a pre/post-await trust gate for outbound private dial and GossipSub publish; recheck on libp2p connection-open and before synthetic receipt evidence; preserve one-way shutdown after an observed trust failure.
- **Tests:** in-flight revocation and seed change with real private ledger/watchdog state; precheck refuses unauthorized network action; transport errors remain clear when trust stays valid. See [ADR-H02b-003](ADR_H02B_ASYNC_TRUST_BOUNDARIES.md).
- **Limits:** postchecking cannot undo a message already sent or make revocation atomic; the watchdog and host firewall remain necessary. No public listeners, public enrollment, real BLE or launch gate updates.
- **CI/merge:** [PR #85](https://github.com/vedantd/palantinty-network/pull/85) merged as `e494ad6764ffbd3327d6b38f692ea3198e14ea6c` after green [CI run 42405659510](https://github.com/vedantd/palantinty-network/actions/runs/42405659510): **212/212 tests passed** including P02c/M10 Docker. H02b remains **partial**; crypto key rotation and atomic remote revocation are not verified.

## 2026-11-07 — H02a ledger compare-and-swap and durable rename (verified PR #83)

- **Starting point:** merged H2 watcher regression [#80](https://github.com/vedantd/palantinty-network/pull/80) and offline coverage [#81](https://github.com/vedantd/palantinty-network/pull/81). H02a/H02b remain partial.
- **Threat:** stale operator decisions could be applied to a newer ledger snapshot; file fsync before rename did not guarantee directory-entry durability.
- **Implementation:** optional `expectedRevision` checked inside the exclusive writer lock for propose/approve/revoke; reject invalid/stale/overflow revisions; fsync state directory after atomically renaming the committed ledger.
- **Tests:** stale operations, correct CAS transitions, malformed revision, exhausted revision counter, and orphaned temporary snapshot refusal. [ADR](ADR_H02A_LEDGER_CAS_DURABILITY.md) covers crash/rollback limits.
- **Residual:** existing CLI does not require CAS; watchdog is still polling, file revision does not stop hostile rollback, and cross-machine revocation and physical-host evidence are incomplete. All release gates remain blocked.
- **CI/merge:** [PR #83](https://github.com/vedantd/palantinty-network/pull/83) merged as `a30979fa7176058ff165fa1ba42c9d3e7ce00952` after complete [CI run 42403138130](https://github.com/vedantd/palantinty-network/actions/runs/42403138130): **209 tests passed, zero failed**, including private Docker integration. H02a remains **partial**; no synthetic or real-sensing release gate advanced.

## 2026-11-07 — D01 offline signed fictional-region coverage validation (merged PR #81)

- **Starting point:** #74's watchdog tests successfully rebuilt/merged as [#80](https://github.com/vedantd/palantinty-network/pull/80) with [200/200 passing tests](https://github.com/vedantd/palantinty-network/actions/runs/42401338305). Reconstruct D01 coverage from conflicting/failed PR #75 on the new main.
- **Bug root cause:** Node.js rejects `createPublicKey` on an already-public Ed25519 KeyObject; the earlier verifier consequently returned false on valid signed advertisements. Use reviewed local public Ed25519 KeyObjects directly or explicitly public PEM trust anchors.
- **Deliverable:** Fixed-field fictional `syn:` region coverage payload, canonical bytes, Ed25519 signature, short-lived TTL, strict region matching, local peer/public-key allowlist, negative/adversarial key substitution tests and [ADR](D01_PRIVATE_COVERAGE_ADVERTISEMENTS.md).
- **Still missing:** Canonical real coarse-region privacy contract, cryptographic binding of libp2p Peer ID to signing key, network advertisements and provider lookup, independent operators, public admission. This is **not D01b complete** and changes no launch gates.
- **CI/merge:** Rebuilt [PR #81](https://github.com/vedantd/palantinty-network/pull/81) merged as `e8e97fcb0cc1ecbba1ca0b893191df29650c9ec4`, with full green [GitHub Actions run 42401745685](https://github.com/vedantd/palantinty-network/actions/runs/42401745685): **206 tests passed / 0 failed** and private Docker integration green. Original failed/conflicted #75 closed as superseded. D01b moves from planned to **partial** only; D01a/D02 remain planned; release evidence profiles stay 0/6 synthetic and 0/7 real.

## 2026-11-07 — H2 one-way private watchdog rollback regression (rebased from #74)

- **Scope:** Port PR #74's two safety tests onto current merged main without overwriting the completed README/roadmap changes; no runtime logic changed.
- **Checks:** An observed invalid config or drifted pinned remote must permanently trip the current running guard, exactly once, even if a restored config passes a fresh standalone approval check. Uses separately provisioned ephemeral operator identities and local approval state.
- **Decision:** [ADR-H2-001](ADR_H2_WATCHDOG_ONE_WAY_TRIP.md). This does **not** prove atomic revocation, remote disconnect, instantaneous observation of transient mutations, or Internet admission safety. H02a/H02b and #66 remain partial; all public release gates blocked.
- **CI/merge:** Rebuilt test-only [PR #80](https://github.com/vedantd/palantinty-network/pull/80) merged as `12d35620d5add69b7417bf57f8d6b4bda8cfe72d` after passing [run 42401338305](https://github.com/vedantd/palantinty-network/actions/runs/42401338305): **200 tests passed / 0 failed** and private Docker integration green. Original conflicted #74 closed as superseded. H02a/H02b remain partial.

## 2026-11-07 — Public-facing README and evidence-based progress visualization (verified PR #78)

- Replaced long README demo inventory with an architecture-first public landing page, accessible vector banner, existing editable Excalidraw network diagram and scoped runnable quickstart.
- Added `assets/roadmap-progress.svg`, generated deterministically from `config/release-execution-tracker.json` and `config/public-release-gates.json`; new regression tests enforce consistency. No fabricated readiness or percentage claims.
- Updated public launch and field-research roadmaps to reflect verified merges #76/#77, open conflicting #74/#75, and the unverified six plus seven launch gates. Detailed demo commands remain reachable in `docs/PROTOTYPE_DEMOS.md`.
- **Verification:** [PR #78](https://github.com/vedantd/palantinty-network/pull/78) merged as `7c220db8ba46f12c7228a11cb6c6023cd1f39c28` after successful [GitHub Actions run 42399271410](https://github.com/vedantd/palantinty-network/actions/runs/42399271410): **198/198 tests passed**, including P02c and M10 private Docker integration, and release gate assertions remained blocked. Fifteen local README links were checked for existing repository targets. The first CI attempt failed an existing branding documentation contract; explicit project heading and nonlive warning were restored and verified on the final head.

## 2026-11-07 — H1c least-privilege CI policy regression guard (PR pending)

- **Starting point:** inspected current main CI, H1a/#70 and H1b/#72 logged merges, open H1/#65, H2/#66 and independent-host/#67, and open H2 PR #74. Avoided overlapping H2.
- **ADR-H1c-001:** protect reviewed CI invariants with a narrow source-text policy test rather than introducing a new YAML dependency; reject privileged PR triggers, write token permissions, mutable action revisions, unlocked install, missing lock verification, or missing public release-block assertions. Test does not replace GitHub branch protection or human workflow review.
- **Implementation:** `src/ci-policy-check.mjs` and `tests/ci-policy-check.test.mjs`, with positive checked-in workflow and six negative mutation scenarios. Existing `npm test` includes tests automatically. No listener or real-data changes.
- **Verification:** full GitHub CI pending at time of commit. Do not merge until the entire workflow passes. CI policy regex is intentionally conservative and may reject legitimate future workflow changes until reviewed. Both release profiles remain blocked.

## 2026-11-07 — H1b-1 immutable CI and CycloneDX evidence merged

- **PR:** [#72](https://github.com/vedantd/palantinty-network/pull/72), merge commit `f6f76491ff65031230315d0ea094d67b62f26b85`.
- **CI:** [run 42374563925](https://github.com/vedantd/palantinty-network/actions/runs/42374563925), job `128409400059`: **success**, **184 tests passed / 0 failed**, release gate checker and P02c/M10 private-container integration passed.
- **Supply-chain artifact:** GitHub Actions artifact `h1b-node-locked-cyclonedx-sbom` (artifact ID `13575545881`), CycloneDX **1.5**, **131** dependency components, SHA-256 of raw JSON `81ac3524df6687b0d6bca21651a7b12aa0f1da0fa41e35af4d818c67d6abacab`. Artifact expires after 14 days; retention is not permanent immutable provenance.
- **CI action pinning:** Official immutable checkout v7.0.1, setup-node v7.1.0 and upload-artifact v7.0.2 SHA references with read-only PR token.
- **Status:** H01b remains **partial**. Docker base digest pinning, CVE and maintainer triage, signed release provenance/artifacts, rollback and external review remain outstanding. Official `release-supply-chain` gate is still blocked, as are all other public release gates. Follow [#65](https://github.com/vedantd/palantinty-network/issues/65).

## 2026-11-07 — H1b-1 immutable GitHub Actions and dependency SBOM (CI pending)

- **Starting point:** H1a lockfile npm ci merged (#70), H01a tracker verified, H1b #65 still release-blocking.
- **Research:** Official GitHub refs/releases for checkout v7.0.1, setup-node v7.1.0 and upload-artifact v7.0.2 inspected on 2026-11-07; action execution moves to Node 24 runtimes but project remains Node 22.
- **Decision ADR-H1b-1:** Use immutable 40-hex action revisions and read-only PR token, produce CycloneDX SBOM from locked dependencies, retain for 14 days as evidence only.
- **Implementation:** CI SHA pins, `npm sbom` and immutable artifact upload, regression tests, [H1B_CI_PROVENANCE.md](H1B_CI_PROVENANCE.md).
- **CI:** Pending until actual full GitHub Actions run completes. No gate unblocked.
- **Residual:** Docker image digest pinning, dependency audit triage, verifiable signed/tagged release, independent reviewer and all non-supply-chain gates remain open.

## 2026-11-07 — H1a lockfile and CI verification merged

- **PR:** [#70](https://github.com/vedantd/palantinty-network/pull/70), merged to main at `94fbddc0243831c4cc14174f7f5da0f0d37da689` from `c091096357c33457565926968ce0e6d3148743fa`.
- **CI:** [run 42373905601](https://github.com/vedantd/palantinty-network/actions/runs/42373905601) **success** — `npm ci --ignore-scripts`, `build:lock-check`, `release:plan-check`, **182 tests passed / 0 failed**, both blocked release profiles, P02c private bridge and M10 two-run persistent indexer integration.
- **Provenance:** `package-lock.json` SHA256 `1480492b81aeed9167a605b9c738392c384eb9cf8b7622b674deb516a8feed12`, 131 npm SHA512 tarball integrity records. Temporary trusted branch-only lock bootstrap and uploader removed before merge; `contents: read` remains the normal CI permission.
- **Scope:** H01a complete. H01b **not complete** (immutable action/image digests, SBOM, advisory triage, reproducible release artifacts, signatures). Official `release-supply-chain` and other public gates stay blocked. Next H01b or H02a based on independent review.

## 2026-11-07 — H1a deterministic npm lockfile (draft PR #70, CI pending)

- **Issue:** #65; previously CI/Docker used floating `npm install`.
- **Provenance:** Generated lockfile using trusted Node 22 GitHub runner, artifact in run 42373300374. SHA-256 `1480492b81aeed9167a605b9c738392c384eb9cf8b7622b674deb516a8feed12`, npm lock v3, 131 sha512-integrity tarballs from `registry.npmjs.org`. One-time trusted branch-only bootstrap run 42373521028 committed identical SHA; temporary write-scoped workflow removed before merging.
- **Decision ADR-H1a-001:** Require committed manifest-lock and `npm ci --ignore-scripts` in CI and both synthetic private containers; validate root dependency match, registry provenance and integrity. Ignore install-time package scripts unless a future security review explicitly authorizes them.
- **Tests:** New positive/negative `dependency-lock-check.test.mjs`, `build:lock-check` CI step, full GitHub Actions and Docker pending. Do not merge if red.
- **Limitations:** Mutable GitHub Actions/Docker tags, SBOM/signing/vulnerability triage remain H1b; 6+7 release gates blocked. No real sensor or public network activation.

## 2026-11-07 — Release-scope execution plan and safety-gated tracker (CI pending)

- **Starting point:** H0 private operator trust PR #64 merged; public release profiles remain blocked, and H1/#65, H2/#66, independent hosts/#67 are open.
- **Decision ADR-PLAN-001:** Plan all 28 slices through two **separate** release profiles, with machine-readable dependency DAG and an explicit 6-gate synthetic and 7-gate real-sensing mapping. Do not imply eight hours of scheduled sessions can replace independent physical/legal/privacy evidence.
- **Deliverable:** [PUBLIC_RELEASE_EXECUTION_PLAN.md](PUBLIC_RELEASE_EXECUTION_PLAN.md), `config/release-execution-tracker.json`, `src/release-execution-tracker.mjs`, CLI and negative tests, CI gate. CI and merge state to be appended after verification.
- **Next:** H01a committed dependency lockfile and `npm ci` (#65), then H2 and private indexer/storage work if blocked. User authorized hourly work through afternoon; each run should inspect current main/CI to avoid overlap.
- **Safety:** Untrusted Internet listener and real BLE network publishing remain off; release gates remain blocked regardless of coding progress.

## 2026-11-07 — H0 runtime trust hardening verified and merged

- **PR:** [#64](https://github.com/vedantd/palantinty-network/pull/64) merged to `main` as `a42b9ab23406d2c34d34f70f3d445eb258f60ab9` from approved head `454c59ea014b507143826cad5deb819af2b2690e`.
- **CI:** [GitHub Actions run 42371653555](https://github.com/vedantd/palantinty-network/actions/runs/42371653555), job `128400851018`, completed **success** with **175 tests passed / 0 failed**, both release-gate assertions, network demonstrations and isolated private-container integration. An earlier failed run exposed a test-output timing race, which was fixed before the verified merge.
- **Behavior:** The standalone P02c operator pilot now refuses unknown, candidate, revoked and drifted private pins at preflight/start. A local watchdog detects enrollment revision/config changes and best-effort closes active libp2p connections. Tests cover live observer revocation.
- **CI security hygiene:** Workflow token explicitly restricted to read-only `contents: read`; job timeout bounded. No public network listener or real-data pipeline enabled.
- **Open blocking work:** [H1 supply chain #65](https://github.com/vedantd/palantinty-network/issues/65), [H2 revocation races #66](https://github.com/vedantd/palantinty-network/issues/66), [P02c physical hosts #67](https://github.com/vedantd/palantinty-network/issues/67). These are not resolved by this merge.
- **Release safety:** Both public synthetic and public real-sensing gate profiles remain blocked; the private pilot is not evidence of community joinability.

## 2026-11-07 — H0 targeted hardening review and private runtime trust guard

- **Audit:** Inspected P02c operator runtime, P03a approval ledger, P03b staging, P03c audit, P03d inspection, private file handling, CI build inputs, README/JOIN links and public release gates. Findings and severity are in [HARDENING_AUDIT_2026_11_07.md](HARDENING_AUDIT_2026_11_07.md).
- **Decision ADR-H0-001:** A P03 approval ledger must not remain purely advisory for the operator-run private pilot; startup must refuse unapproved pins, and a running node must stop on observed revocation or unexpected local approval/config revision changes. Keep all network listeners private and synthetic-only.
- **Implementation:** `src/p03-runtime-trust-guard.mjs` and integration into `apps/p02c-host-pilot.mjs`; migration of existing P02c test fixtures to explicit local approved enrollments; new live-node revocation tests; update runbooks and canonical links.
- **Tradeoff:** Tightens local operator state, but polls files rather than offering atomic revocation. An unresponsive process, compromised host, or race within the poll window still requires OS firewall/process containment; no public peers or real sensor inputs are activated.
- **Verification:** PR CI pending at authoring; final GitHub Actions and merge evidence should be recorded after successful full suite. Do not claim release-gate clearance from green CI.
- **Unresolved:** No committed npm lockfile/\`npm ci\` (H-002), no independent two-physical-host trial (H-003), TOCTOU/revocation boundary (H-004), geographic indexer lookup (H-008), indexer disaster recovery, real-sensing rights/privacy. See [EXECUTION_ROADMAP_NEXT.md](EXECUTION_ROADMAP_NEXT.md).
- **Next:** H1 reproducible dependency/build supply chain, then transactional private revocation and independently validated hosts; proceed to D01 private signed regional indexer directory only after core safety issues are understood.

## 2026-11-07 — P03d verified CI and merge evidence

- **PR:** #62 P03d offline startup-readiness inspection, head `6730263e17109b19439202fd93de18e22b0685bf`, squash merged to `main` as `49078b9e8ca6f3eec4df493812e11b7706db7e5c` after successful checks.
- **CI:** GitHub Actions `test` run [42357868052](https://github.com/vedantd/palantinty-network/actions/runs/42357868052), completed **success**; `node-tests` job `128359811468` passed `npm test`, synthetic demos, private-container checks and the public-release-gates assertion. CI is not independent physical-host evidence.
- **Decision:** Preserve ADR-P03d-001 as read-only, operator-reviewed inspection. No runtime authorization, live trust mutation or public admission. Next slice should consider an independently tested private discovery mechanism without widening listeners or trust.
- **Outstanding:** Snapshot TOCTOU and revocation race, runtime not integrated, no independently administered physical-host test, no real BLE ingestion, public release gates blocked.

## 2026-11-07 — P03d offline private startup-readiness inspection (CI pending)

- **Starting state:** `main` at `7524de1aed5388f9c55625191bd9443c53c4c2bf`; no open PRs. Inspected P03c audit, P03a ledger, P02c host config and emergency-stop operations, existing tests, project status and prior CI evidence.
- **Decision ADR-P03d-001:** Add read-only operator inspection, not a runtime authorization gate. See [P03D_OFFLINE_STARTUP_INSPECTION.md](P03D_OFFLINE_STARTUP_INSPECTION.md).
- **Implementation:** `src/p03-startup-inspection.mjs` validates private config and stop state, requires an existing distinct operator identity, audits exact approved remote pins and repeats reads to detect some concurrent drift.
- **Tests:** `tests/p03-startup-inspection.test.mjs` covers approved, unknown, candidate, revoked, stop-marker, missing config and missing local identity. **GitHub Actions pending; do not merge before green.**
- **Outstanding:** Repeated reads are not atomic and the runtime does not consume this inspection; manual restart may race with revocation. No independent physical-host evidence; public release gates blocked.

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


## 2026-11-07 — P02c evidence manifest preflight (PR pending)

- **Starting state:** Inspected current main roadmap and CI workflow, issues #65/#66/#67 and active PRs #74 (H2 watchdog tests), #75 (D01 offline signed region advertisements), #76 (H1 CI policy tests). Avoided overlapping all three active slices. H1 lockfile and least-privilege workflow are already present on main; CI verification for open PR heads was not available through the commit workflow lookup.
- **Decision:** ADR-P02c-002 adds a narrow offline manifest checker for future independently operated two-host evidence. It never asserts independent hosts or verifies release gates.
- **Implementation:** Strict two-host/operator/key declarations; six required scenarios with references to both host-side artifacts; relative path, non-symlink regular-file, size and SHA-256 integrity checks. Fixture-based positive and nine negative tests. No networking, BLE or runtime trust change.
- **Verification:** GitHub Actions full PR workflow pending. No merge before full passing workflow. Synthetic fixtures do not count as real P02c evidence.
- **Limitations:** Metadata can be fabricated; real independent operator signoffs, actual firewall/private-overlay evidence, logs, host provenance and fault observations remain blocked on physical access. Public synthetic and real-data release profiles remain blocked.
