# P01a — independently configured synthetic-only indexer runtime

**Status:** experimental operator service for pre-provisioned **trusted** private IP peers. It does not enable open or public Internet participation and never publishes real Palantiny observations.

`apps/operator-indexer.mjs` accepts a **private 0600 JSON config** with a persistent operator key stored in a separate 0700 directory, an explicit loopback/private LAN listener, authorized report-signing public key IDs and pinned indexer peer IDs. No shared `/coord` volume, public directory service, DHT trust inference or automatic enrollment is used.

## Operator configuration

The exact schema is `palantiny.synthetic-indexer-config.v1` with required fields:

```json
{
  "schema":"palantiny.synthetic-indexer-config.v1",
  "syntheticOnly":true,
  "mode":"serve",
  "region":"synthetic-pilot-one",
  "stateDir":"/absolute/private/data",
  "listen":"/ip4/127.0.0.1/tcp/40123",
  "allowPrivateLan":false,
  "authorizedSigningKeys":["<64-char-hex-authorized-ed25519-key-id>"],
  "trustedIndexerPeers":["<authenticated-remote-libp2p-peer-id>"],
  "upstreamPeerId":null,
  "upstreamManifest":null
}
```

For `mode: "sync-once"`, use a **manually verified** operator manifest as `upstreamManifest` and set `upstreamPeerId` to its explicitly pinned Peer ID, which must appear in `trustedIndexerPeers`. Both the address and region must match. Set `allowPrivateLan:true` only for a concrete RFC1918 IPv4 interface; public/wildcard listeners are never accepted.

Before runtime, create an operator-owned persistent identity:

```sh
npm run operator:identity -- /absolute/private/data/operator-identity
chmod 700 /absolute/private/data
chmod 600 /absolute/private/config.json
npm run operator:indexer -- /absolute/private/config.json
```

The source indexer serves its **existing local signed-archive history**, not newly sensed data. A destination node in `sync-once` mode connects and verifies the archive via libp2p Noise, writes its own SQLite history and exits nonzero unless its private archive fingerprint matches the source. The service reports a redacted JSON result; no private key or per-signer envelope is printed. `serve` waits for SIGTERM/SIGINT and closes its data store.

## Security/architecture decisions

- **P01a-1:** Every node is independently configured. The source and destination do not share a coordination filesystem; each has its own SQLite and identity key. This removes the Docker demo's automatic manifest trust injection.
- **P01a-2:** `syntheticOnly:true` is mandatory, and only `serve` or `sync-once` is accepted. This is a *configuration boundary*, not a cryptographic proof the source archive never contains real observations. Use only designated synthetic test databases.
- **P01a-3:** A private config and pinned identity do not constitute secure public enrollment. Public onboarding requires an authenticated channel, key compromise response and revocation semantics.
- **P01a-4:** Region and signer allowlists are explicit. Signatures authenticate possession of an Ed25519 key, not human attendance, sensor quality, location or independent operators.
- **P01a-5:** The runtime cannot connect to public IPs; any permissioned RFC1918 deployment still needs independent firewall/VPN rules. It is **not** a public participation client.
- **P01a-6:** `sync-once` is for a bounded operator check, not a supervised unattended daemon. Current simple retry limit is local and does not provide cross-partition eventual consistency proof.

## Acceptance checks

`npm test` spawns **two separate Node.js processes** with different private directories, persistent Peer IDs and config files, seeds the source with signed synthetic reports, starts an authorized indexer handler, pulls reports from the destination and verifies independent SQLite convergence. It also tests denial of unsynthetic config, malformed addresses, duplicate signer keys, a mismatched upstream identity, and unsafe file permissions.

Remaining **P01** work: a fully supervised per-host lifecycle and restart/recovery deployment drill without shared coordination, followed by two physically independent machines on a private overlay. **P02** is required before any public listeners.
