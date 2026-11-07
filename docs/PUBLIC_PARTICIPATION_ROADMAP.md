# Palantiny-Network — public participation launch roadmap

**Date:** 2026-11-06. **Current state:** public source code with tested private synthetic libp2p demos; **not** an open participant network. This is a planned and evidence-gated sequence, not a promise of release dates.

## Two distinct launch targets

**A. Open synthetic testnet** — anyone can obtain the source and run a peer without sharing real Bluetooth observations. May admit untrusted test participants only after public network hardening. No independently supplied data is represented as verified sensing.

**B. Public real-sensing network** — opted-in real sensors with site permissions and calibrated, delayed activity signals, independently reviewed privacy and retention controls. No public data release simply because the software network is open.

## Execution order

| Slice | Outcome | Testing/exit criteria |
| --- | --- | --- |
| P00 | Release gates, threat model, backlog | CI validates complete blocked ledger and dependency of real-sensing on synthetic-testnet |
| P01 | Standalone synthetic-only operator runtime, no shared Docker volume | **P01a:** separate-process, operator-configured runtime (pending merge); **P01b:** supervised restart/failure and cross-host evidence still required |
| P02 | Secure public transport: non-wildcard remote listeners, resource limits, bootstrap policy | Unauthorized peers, malformed frames, traffic floods, slow peers, NAT/relay testing |
| P03 | Open synthetic enrollment and node lifecycle | Join/leave/ban/revoke, pinned identity, downloadable packages, default-deny real sensing |
| P04 | Replicated archive hardening, observability and incident playbooks | Fault tests, network partitions, database backup/restore and monitoring, no silent divergence |
| P05 | Sybil resistance and verified contributions | Multiple keys cannot be treated as multiple independently attested sensors; abuse tests |
| P06 | Calibration and privacy field protocol | Site consent/permissions, ground truth, holdouts, false positive analysis, independent review |
| P07 | Restricted real-sensor pilot | Explicit opt-in, metadata minimization, retention/deletion exercise, coverage suppression |
| P08 | Gradual public real-sensing eligibility | Security/privacy signoff, operation owners, transparent limitations and rollback |

## Critical decisions

1. **Never merge synthetic and real release tracks.** An unsigned or unverified internet user's synthetic result must not influence public regional insights. Use separate namespaces, service contracts and data stores.
2. **Data ownership is distributed; trust need not be universal.** Nodes can run without a central data collector; publishing verified measurements still requires a defined independent-attestation policy.
3. **Existing encrypted libp2p is not proof of anonymity, integrity of observations, location or independence.** Stable signing keys and coarse region/time combinations remain linkable.
4. **Do not expose per-signer signed reports on public GossipSub.** Privately exchanging signed archives among verified indexers does not authorize publishing that metadata on an untrusted mesh.
5. **Public onboarding requires abuse controls and a safe kill switch.** Peer admission, resource limits, rate limiting, rekeying, and incident handling must be tested before enabling public listeners.
6. **Remote deletion cannot be guaranteed just by deleting the local outbox.** Decide retention durations, replication and withdrawal semantics before real sensor releases.
7. **Do not claim a proven cross-machine Internet test until actual independently administered hosts have passed.** A Docker bridge test is not such evidence.
8. **No blockchain/token is necessary** for the initial synthetic mesh or verified regional summaries.

## Go/no-go procedure

`config/public-release-gates.json` lists blocked gates separately for the synthetic testnet and real-sensing network. Run:

```bash
npm run release:check -- open-synthetic-testnet
npm run release:check -- public-real-sensing
```

A nonzero exit status means not ready. Changing a gate to verified requires an auditable, reviewed external evidence reference, and these files are a **human-maintained evidence ledger, not a secure production authorization service**. Independent reviewer signoff and operational ownership are separate prerequisites.

## Release management

Keep PRs small and anchored in explicit acceptance tests. Each slice updates this plan, [PROJECT_STATUS.md](PROJECT_STATUS.md), security notes and CI. Do not silently open public network interfaces or activate real sensor publishing. Publish accepted issues/PRs for community software participation, but do **not** invite real-world volunteers to share observations until P07's gates are satisfied.
