# P02c-3 — local emergency shutdown, peer revocation and health telemetry

**Status:** implemented for the private synthetic pilot only. No remote administration API, public listener, real BLE ingestion, or approval of public participation.

## Local operational controls

The operator-only CLI `apps/p02c-pilot-control.mjs` accepts a private 0600 P02c pilot configuration. The state directory must already be owner-private (0700).

```sh
npm run pilot:control -- status /srv/palatiny-pilot/host-config.json
npm run pilot:control -- stop /srv/palatiny-pilot/host-config.json
npm run pilot:control -- revoke /srv/palatiny-pilot/host-config.json VERIFIED_REMOTE_PEER_ID
```

`stop` creates a persistent local `PILOT_DISABLED.json` marker in the operator's state directory using exclusive creation and 0600 permissions. A running pilot checks every 100 ms and closes its libp2p instance on detecting the marker; the marker also blocks future `preflight`, `observe` and `publish` commands. A malformed marker, including a symlink, is **not** treated as an authorization to start. Signals SIGINT and SIGTERM also request process-local shutdown but do **not** persist a stop marker: use `stop` for emergency lockdown.

`revoke` records the **currently pinned** remote Peer ID and shuts down the local process. It does not modify the remote node, erase already propagated data, invalidate the remote operator's keys on other hosts, or distribute a network-wide ban. To restore a revoked relationship the operator must replace the remote Peer ID and seed in their private config, verify the replacement identity and overlay firewall outside the process, then explicitly run:

```sh
npm run pilot:control -- resume /srv/palatiny-pilot/host-config.json --reviewed
```

`--reviewed` is an operator assertion, **not** a cryptographic authorization, independent signoff, or remote attestation. An emergency-stop marker can be cleared with explicit operator review; a peer-revoked marker refuses resume if the old revoked Peer ID is still configured. No automatic key rotation or centralized revocation service is introduced.

## Connection health and incident evidence

The existing `pilot:observe` and `pilot:publish` processes emit low-cardinality `connection-health` records about once per second: active libp2p connection count, whether the pinned Peer ID is connected, and sanitized local observer counters. They never emit private keys, raw BLE identifiers or per-packet payloads. A `local-shutdown` event distinguishes a detected disable marker from a local OS signal. These events are local JSON-lines evidence; the P02c-2 reviewer still requires independent signed synthetic report receipt and **never** upgrades `remoteHostsVerified`.

## Tests

```sh
node --test tests/p02c3-pilot-operations.test.mjs
npm test
npm run release:check -- open-synthetic-testnet --assert-blocked
npm run release:check -- public-real-sensing --assert-blocked
```

Includes persistent stop/restart refusal, exact-peer revocation, replacement-peer-only resume, malformed/dangling-marker behavior, one-shot watcher, a real libp2p observer terminated by a marker, and blocked preflight after emergency shutdown. Existing P02c-2 delivery and outage tests remain in CI.

## H0 amendment: approved enrollment required by pilot runtime

The standalone P02c pilot now requires an independently approved P03a local enrollment entry at startup and preflight. The running process also polls for revoked/missing/corrupt ledger, unexpected revision, private config changes and the existing emergency-stop marker, shutting down when it detects them. This is a local enforcement check; existing `pilot:control revoke` remains a separate persistent emergency-stop mechanism. Changing enrollment never automatically approves or connects a new peer.

The polling interval and event loop leave a residual race; for incidents also stop the process and block the overlay port at the host firewall. See [HARDENING_AUDIT_2026_11_07.md](HARDENING_AUDIT_2026_11_07.md).

## Risks, limitations and next exit criteria

- Local polling is a **best-effort** stop mechanism. An unresponsive event loop, machine outage, compromised host or another uncooperative process can prevent timely termination. Shut down the host process and **block the overlay TCP port at the firewall** during incidents; do not rely only on the marker.
- This only controls the current independent-host synthetic pilot. Other protocol modes and deployed peers have their own controls. Stop markers are local operator policy, not global censorship, distributed bans, or permissionless governance.
- Connection health is not bandwidth, CPU, memory, queue-depth, resource-manager, NAT or network-wide flood monitoring. No alerting/24x7 response owner is configured.
- The peer allowlist is currently loaded at node startup; a revoked relationship must stay stopped until the operator changes and independently verifies a new pin.
- Complete the actual two-physical-host incident drill, collect signed/independent operational evidence, define emergency contacts and supply-chain rollback before considering any public synthetic testnet.
- Location-region DHT discovery and public indexer advertisements are planned **only after** security and lifecycle work, and must not be conflated with the current private operator indexer replication.
- **All public testnet and real-sensing release gates remain blocked.**
