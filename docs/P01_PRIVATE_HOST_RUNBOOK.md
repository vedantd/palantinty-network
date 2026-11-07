# P01b — independently provisioned private-host operator runbook

**Status:** runnable operator CLI and simulated signing fixtures; **not** a validated cross-physical-host deployment. The source repository is public, but the network remains permissioned and synthetic-only.

## Requirements

Two independently administered hosts, each with Node.js 22+, a private TCP-capable IPv4 overlay such as WireGuard, a firewall allowing only known overlay peers and an operator-controlled state directory. **No public/wildcard listener, real Palantiny observation or shared network directory.** Do not run against the public internet.

## Set up each host independently

1. Clone the repository and run `npm install`. On each host, create its own `0700` state directory and persistent libp2p identity:

   ```sh
   mkdir -p -m 700 /srv/palatiny-operator
   npm run operator:identity -- /srv/palatiny-operator/operator-identity
   ```

2. Exchange **public Peer IDs** over a pre-existing trusted channel and pin the other's Peer ID. The identity private keys remain only on the originating machine. Choose one coarse, **synthetic-prefixed** region label, e.g. `synthetic-community-test`.

3. Only on the source host, generate explicitly synthetic signed records in a **fresh empty** index database:

   ```sh
   npm run operator:seed -- /srv/palatiny-operator synthetic-community-test
   ```

   The output lists two public authorized signing key IDs. Copy **only those IDs** into both host configs. Do not copy the fixture signer private keys. The seed refuses an existing database and cannot read real BLE input.

4. Create a `0600` config on **each** host, following [P01a config schema](P01_STANDALONE_OPERATOR.md). The source uses `mode: "serve"`, `listen: "/ip4/10.77.10.1/tcp/40123"`, `allowPrivateLan:true`, `trustedIndexerPeers:[<manually verified replica PeerID>]`, and null upstream fields. The replica uses `mode: "sync-once"`, a loopback listener, `allowPrivateLan:true` for the remote overlay, `trustedIndexerPeers:[<verified source PeerID>]`, and the verified `upstreamPeerId` + `upstreamManifest` fields. Never configure a source address of `0.0.0.0` or a public IP.

5. On the source host, run:

   ```sh
   npm run operator:preflight -- /srv/palatiny-operator/config.json
   npm run operator:manifest -- /srv/palatiny-operator/config.json
   npm run operator:indexer -- /srv/palatiny-operator/config.json
   ```

   The manifest contains only the source public Peer ID, its region and private overlay address. **Manifest delivery is not authentication**: the replica operator must verify the exact Peer ID independently before pinning it.

6. On the replica host, verify its own preflight, then sync:

   ```sh
   npm run operator:preflight -- /srv/palatiny-operator/config.json
   npm run operator:indexer -- /srv/palatiny-operator/config.json
   ```

   The replica should exit zero with `status: "consistent"` and **six synthetic signed reports**. It must exit nonzero if it cannot connect, the archive fails validation, or histories differ. No raw BLE identifiers or physical-activity claims are involved.

## Firewalls / network controls

Bind the source to a single explicit authenticated overlay address; at the host firewall allow the chosen TCP port **only from the replica's overlay address**. Deny other inbound interfaces and do not publish the indexer service through a public load balancer. Verify that the connection is routed over the intended private overlay. An overlay's existence alone does not verify its operator's identity, which must also match the pinned Noise/libp2p Peer ID.

## Restart, outage, and rejection drill

- Stop the source gracefully and start it again using the same state directory. Confirm its public Peer ID is unchanged. Run replica `sync-once` again; it must accept no duplicates and report a matching digest.
- Block the source port via the overlay/firewall. The replica must not report a successful sync. Restore the port and retry; the archive must agree again.
- Intentionally configure a wrong pinned Peer ID on a **synthetic test host only** and require the preflight/sync to fail. Restore the verified manifest.
- Record redacted results with OS type, tested private IP family, revision, observed peer IDs, archive counts/digests, and failure cases. **Never publish key files, BLE dumps, detailed physical locations or actual sensor data.**

## Automated evidence and limits

CI verifies manifest/preflight and synthetic seeding, rejects unsafe configs, and runs an independent two-process localhost sync. The prior M10 Docker CI covers distinct network namespaces and restart-stable volumes. **Neither proves actual separate physical-machine connectivity**; that execution gate remains outstanding until two machines and an operator can carry out this drill.

This is a provisional private pilot. **P02** must harden discovery, untrusted peers, resource limits, registration and public transports before anyone can join a synthetic public testnet. P05–P07 must address real sensing, Sybil/location trust, consent, calibration, privacy and distributed retention before recruiting real-data contributors.
