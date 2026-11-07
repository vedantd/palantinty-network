# P02c-4 — controlled private synthetic incident drill and evidence

**Status:** reproducible CI drill and offline transcript-consistency review, not an independent physical-host execution. No public listener, enrollment, real BLE data, or geographic DHT routing is activated.

## Drill outcomes

1. Start independent persistent-identity synthetic publisher and observer processes, with no shared test identity folder. Require an actual sanitized signed report receipt and matching report ID in both captured transcripts.
2. Stop the observer entirely; the publisher must exit **nonzero** and record no publish success or observer receipt.
3. Restart the original observer with the original keys; a fresh synthetic fixture must arrive with a **different** report ID and the same pair of Peer IDs.
4. Write a persistent local peer-revocation marker; preflight/observe must reject restart. Resume with the same revoked Peer ID must fail, even with operator assertion.
5. Try a mis-pinned publisher config and require failure. Because the CI wrong-pin check runs without an observer, **this alone is not isolation evidence**; actual remote hostile-peer rejection remains a separate manual acceptance gate.

The reviewer `pilot:incident-review` checks transcript consistency, nonzero outage process code, unchanged identities and fresh report IDs; it returns `remoteHostsVerified:false`, `overlayFirewallVerified:false`, and `publicTestnetReady:false`. These are not signed or third-party-verified logs; no cross-machine facts are inferred from them.

## Manual independent-host acceptance

Operators must separately provision two machines and a private authenticated overlay. One owner per machine should retain the machine's private keys. Capture:
- Network routing and firewall rules restricted to one verified overlay IP and port, including proof of deny-by-default, kept out of public GitHub artifacts if sensitive.
- Baseline observer and publisher NDJSON logs, explicit publisher outage exit code and output, followed by recovery logs with new signed synthetic report.
- Identities and key persistence over process and OS restart (no private keys copied), recorded by the individual operators.
- Real wrong-peer attempt with the receiving node **online**, and evidence it never remains connected. Local revoked-peer restarts must fail and removal of revocation requires a new independently verified identity.
- Separate operating-system health (CPU, memory, socket counts), networking failure scenarios and independent operator sign-off. Do not assert actual firewall partition from process-only outage.

Offline consistency review on the combined, redacted records:

```sh
npm run pilot:incident-review -- baseline-observer.ndjson baseline-publisher.ndjson \
  outage-publisher.ndjson 1 recovery-observer.ndjson recovery-publisher.ndjson
```

Use the **actual** outage publisher process exit code instead of the example `1`. Any terminal errors are stderr; the outage JSON-line file must still capture the publisher's `started` event. A 25-second observer timeout is a failure, not a verified firewall experiment.

## Local validation

```sh
node --test tests/p02c4-incident-drill.test.mjs
npm test
npm run release:check -- open-synthetic-testnet --assert-blocked
npm run release:check -- public-real-sensing --assert-blocked
```

## Explicit non-claims

CI runs on one machine with separate localhost processes. It does not prove an independent physical-host deployment, NAT traversal, open admission, independent operator attestations, active service monitoring, Internet abuse defenses, or public-sensing privacy. Do not unblock any public release gate based on this code slice.
