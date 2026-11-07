# M10b-1 — persistent node identity and manual peer provisioning

**Scope:** operator-controlled, synthetic-only private-network infrastructure. This slice does **not** claim two physical machines have been tested.

## Stable Noise/libp2p Peer IDs

`openPersistentPeerIdentity(directory)` generates a libp2p Ed25519 key only on initial setup, writes it exclusively as `libp2p.ed25519.key` in a private `0700` directory with `0600` file permissions, and re-opens it on restart. It refuses symlinks, group/world-readable key stores, malformed keys, and missing files with `create:false`. A restart **must not silently rotate** the identity. The existing `createPrivateNode({privateKey})` accepts the saved key. The private M10 Docker pilot now uses its own persistent per-node identity in the independent state volume.

Run on each machine, with the chosen private data directory (do not commit it):

```sh
npm install
npm run operator:identity -- /path/to/private-operator
```

The CLI prints the **public Peer ID** and the local key filename, not the key. The file is **not encrypted at rest**: private operating-system permissions and filesystem backups are operator responsibilities. Do not publish this directory, include it in a Docker image, email it, or check it into Git.

## Trust onboarding: explicitly pinned public manifests

`operatorManifest({peerId,region,seedAddress})` constructs a public document with schema, Peer ID, coarse region and a concrete RFC1918 IPv4 libp2p multiaddress. It refuses mismatch between the address Peer ID and the manifest identity. `validatePinnedManifest(manifest,{expectedPeerId,region})` requires an independently verified exact Peer ID and region; do not infer or automatically approve trust based on an IP address or a manifest downloaded from an untrusted URL.

A manually approved config file should use `0600` permissions and the exact public manifest schema; `readPinnedOperatorFile()` checks permissions, schema and pinned expected identity before returning it. This is **manual, out-of-band verification**, not a certificate authority, a remote enrollment service, or a secure automated trust exchange.

**Example public manifest** (substitute the machine's true authenticated Peer ID):

```json
{
  "schema": "palantiny.operator-manifest.v1",
  "peerId": "<verified-peer-id>",
  "region": "synthetic-m10-pilot",
  "seedAddress": "/ip4/10.20.0.5/tcp/4001/p2p/<verified-peer-id>"
}
```

The actual Peer ID should be confirmed over another trusted channel, for example a pre-existing authenticated meeting or signed corporate communications. Without such verification, an attacker could replace both the manifest and address.

## Decisions, failure safety and test gates

- **ADR-M10b-1:** Separate **node transport identities** from **report-signing identities**. A pinned Noise Peer ID identifies a connection endpoint, but never proves an independent BLE sensor, physical location, operator or consent.
- **ADR-M10b-2:** On first initialization use exclusive file creation; afterwards never overwrite or regenerate a missing key unless explicitly creating a fresh identity. Bad mode, symlink and corrupted key all fail closed.
- **ADR-M10b-3:** Public manifests include no private key, raw BLE observations, location coordinates or user identifiers. A private-LAN address by itself is not an authentication signal.
- **ADR-M10b-4:** Persist the identity only in an operator-controlled private state directory. Docker test volumes survive restarts unless explicitly removed; `down --volumes` intentionally resets the synthetic test network.
- **ADR-M10b-5:** At-rest encryption, backup/recovery, key compromise and credential rotation need a separate security design before operating real sensors or administering public volunteer nodes.

Tests cover shutdown/restart Peer ID stability, key bytes unchanged, permission/symlink failures, corrupted key refusal, manifest schema and region mismatches, untrusted peer IDs, and no public-IP trust grants. CI also runs the M10 container network test with the persistent node keys.

**Next gated slice — M10b-2:** supply a two-independent-host private overlay deployment playbook with firewall rules, independently verified peer manifests, restart and outage drill. A real two-machine run requires operators/hosts that are not available to this CI harness; until then, don't label it validated.
