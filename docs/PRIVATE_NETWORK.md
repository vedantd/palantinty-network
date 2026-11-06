# M04 — Private three-node network spike

**Research-only prototype. No real sensor reports, no public sensor feed.**

Two synthetic contributor nodes dial a preconfigured loopback aggregation node
over libp2p TCP with Noise encryption and Yamux stream multiplexing.

```text
Sensor A -- encrypted libp2p stream --> |
                                       |--> RegionalIngest --> synthetic aggregate
Sensor B -- encrypted libp2p stream --> |
```

## Try it

Node.js 22 or later:

```bash
npm install
npm test
npm run network:demo
```

This demo uses **127.0.0.1 only**, ephemeral identities in a temp directory,
synthetic observations and no bootstrap/discovery, DHT, relay, external server
or GossipSub. It uses the libp2p APIs from their official examples.

## Protocol contract

- Transport: TCP + Noise + Yamux, direct preconfigured peer address.
- Protocol: `/pulsemesh/private-aggregate/0.1.0`.
- One newline-delimited JSON **signed** report per stream, size bounded.
- Aggregator verifies an Ed25519 signature against an explicit contributor
  allowlist, exact report schema, sequence freshness and delayed time bucket.
- Duplicate deliveries get an idempotent ACK; old distinct sequences are rejected.
- ACK confirms in-memory ingestion in the demo, **not durable receipt**.
- Reports are not broadcast. Regional outputs require contributions from at
  least two distinct authorized keys; that is **not sufficient anonymity**.

The signing public key is distinct from libp2p transport identity; it is
linkable, and authorization is manual. Sybil attacks are not prevented. This
demo does not cryptographically verify independent physical sensors or
contributor location. RegionalIngest currently uses in-memory replay records
that disappear on restart, so it is **not production ingestion**.

## Security limits and future work

- No automatic network permission or connection from the macOS scanner.
- Only synthetic activity data is used. Real single-node count reports may
  expose presence and scheduling patterns even without BLE identifiers.
- Do **not** adapt this as a public GossipSub topic without a reviewed
  confidential/threshold aggregation protocol.
- No Internet NAT traversal, remote node enrollment, persistent replay
  registry, metering, anti-Sybil controls, backpressure budget, geo-attestation,
  or resilience to malicious indexer operators is implemented.
- A public regional aggregate requires independent coverage, calibrated signal,
  sparsity limits, delayed publication, and external privacy review.

## Next acceptance criteria

1. Three independent processes exchange synthetic messages (not merely
   three objects in one process); repeat under connection loss.
2. Integrate the durable M03 outbox with authenticated delivery ACK and
   replay-safe persistent regional ingestion.
3. Specify a confidential multi-operator aggregation model before any
   field-derived observations cross a real network.
