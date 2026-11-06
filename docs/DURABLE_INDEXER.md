# M05 — Persistent Regional Indexer and Three-Process P2P Demo

**Scope: synthetic signed observations only.** This milestone has no public
network, no raw BLE inputs, and no real sensor readings transmitted. These are
separate processes communicating only over 127.0.0.1 using libp2p TCP, Noise
and Yamux.

## Architecture

```text
Contributor A (process 1)  ─┐
  persistent key + outbox   ├── encrypted point-to-point ──> Indexer (process 3)
Contributor B (process 2)  ─┘                                SQLite, durable ACK,
  persistent key + outbox                                     replay and time series
```

```bash
npm install
npm test
npm run network:durable
```

The demo creates a disposable, permission-restricted temporary state tree. It
pre-authorizes **two distinct signing keys**, starts three OS child processes,
queues **two synthetic reports** in contributor SQLite outboxes, and delivers
one report with an intentionally ignored ACK. It then **restarts** the indexer
process against the same SQLite file and retries the pending report. The
indexer must recognize the duplicate without counting it again. Contributor
B then delivers its report, after which the aggregate time-series query may
return one regional record.

## What is durable?

An indexer transaction atomically commits a report identifier, contributor
high-watermark sequence, per-region/time-bucket contribution and receive time
using SQLite `synchronous=FULL`. Only after the transaction succeeds does
the service emit `ack:true`. Loss of the ACK leaves the original report
queued, and retried delivery gets an idempotent duplicate acknowledgment.

The contributor outbox records a signed report before attempting a send.
It marks it acknowledged only if a transport ACK explicitly matches its
own `reportId` and states the report was stored or already existed.

## Query contract

`DurableRegionalIngest.query({ area, start, end, limit })` emits **regional
aggregate rows only**, not per-signer observations. It requires a configured
minimum number of distinct signing keys (two in the demonstration) contributing
to the same coarse cell/time bucket. The experimental index is an average of
contributor activity indices—not a count of people.

## Known restrictions

- Each process is independent, but all three run on **one computer via local
  loopback**. Internet connectivity and NAT traversal are **not** demonstrated.
- Each test starts with synthetic aggregate observations. Real BLE data is
  **not** connected to M05.
- Separate signing keys are not evidence of independent sensors. No Sybil or
  physical-location attestation exists.
- Per-signer contributions remain in an operator-controlled private SQLite DB.
  A single trusted indexer can see the reports it receives. No multi-party
  privacy scheme or secure aggregation is implemented.
- The indexer retains report IDs and signing identities indefinitely until the
  configured capacity is reached; hitting capacity **fails closed** rather
  than deleting replay history. Retention and archival must be designed.
- Authorized keys are configured out of band. There is no decentralized
  enrollment, consensus, public validation, DHT, public map, or consumer API.
- The regional coverage threshold is only a preliminary suppression rule;
  **two nodes are not an anonymity guarantee**. Do not publish real or sparse
  observations without a stronger privacy review.
- SQLite's `node:sqlite` interface remains experimental on Node.js 22.

## Next milestone

Validate a repeatable, calibrated activity baseline, define a federated or
multi-operator aggregation privacy model, and only then consider any real
sensor-originated remote transfer. For software, add deliberate contributor
enrollment and indexed history views with role-based access controls.
