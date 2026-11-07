# P02b-2 — global synthetic observer ingestion budget

**Status:** pre-public application-level hardening. No new listeners or real-sensor interfaces.

An observer already has a bounded per-forwarding-peer rate limiter and validates signed, strict synthetic payloads. A rotating forwarding Peer ID could evade that per-peer counter, repeatedly forcing signature verification. The new process-local global budget now charges every synthetic-topic message **before** JSON and signature parsing, independent of the forwarding identity. It has fixed per-window message and byte caps, bounded replay ID memory, and separate counters for global rejects and duplicate verified reports.

- By default a single observer accepts at most 128 admission attempts and 256 KiB per minute across *all* forwarding IDs, and remembers at most 128 distinct signed report IDs for that window. The global cap does not charge traffic for unrelated topics.
- A packet that exceeds the remaining byte allowance is rejected before decode. Message admission is charged before the existing per-forwarding-peer limiter.
- Replays are identified only *after* signature validation and never produce a second sanitized callback within the window.
- Memory does not grow with the number of rotating identities or report IDs. Reaching the seen-ID ceiling fails closed for that window instead of silently evicting accepted reports.
- All counters and payloads remain local; there is no stable identifier export or privileged regional-indexer ingestion.

## Sanity checks

```sh
node --test tests/p02b-ingress-budget.test.mjs
npm test
npm run network:synthetic
```

These cover rotating peer IDs, byte floods, duplicate IDs, quota reset, invalid options and the isolated observer. Previous GossipSub integration checks remain in CI. **Not a network-level denial-of-service defense**: GossipSub routing, Noise handshakes, libp2p stream allocation, CPU scheduling and packet reception still happen upstream of this observer. Per-signer quotas, gossipsub scoring, allocation limits, hostile Internet workloads, real multi-host drills, revocation and incident controls remain future P02/P03 work. Never open a public listener based on this change. Human-reviewed release gates remain blocked.

## ADR-P02b-2

Prefer fixed global budgets plus bounded replay state over an unbounded cache or per-peer-only quotas. Drop legitimate synthetic packets on exhaustion rather than leak memory, overstate arrival rates or treat test data as validated geographic measurement. A synthetic-only namespace and a signed report establish neither physical provenance nor distinct real-world sensor participation.
