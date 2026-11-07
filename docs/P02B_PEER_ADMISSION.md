# P02b-1 — local synthetic peer admission and bounded resources

**Status:** pre-public security slice; pinned localhost-only experimental testnet. No public IPv4 listener, broad peer enrollment, real BLE publishing, verified sensor provenance or trusted regional archive ingestion.

## Scope

`createPinnedSyntheticGossipNode` demands a pre-provisioned libp2p private key and a unique, explicit PeerId allowlist (1–16 IDs). A connection gater rejects unauthorized authenticated Noise peers, non-loopback IPv4 TCP dial targets and inbound non-loopback addresses. No DHT, relay or auto-enrollment is enabled. The fixed connection budget limits active connections to eight, pending inbound to two, dial concurrency to two, and imposes negotiation timeouts. Yamux stream counts and GossipSub stream counts are capped. Invalid configuration fails before starting a listener.

The original `createGossipNode` remains a **localhost-only untrusted demo utility**, not the secure operator runtime. Only the new pinned factory has these admission controls, and users must not infer that old demos are production hardened.

## Validation

```sh
npm install --no-audit --no-fund
node --test tests/p02b-admission.test.mjs
npm test
```

Tests exercise malformed/nonloopback addresses, relays, unknown PeerIds, duplicate pins, missing keys, unsafe binds, a successful private pinned-peer dial and refusal of an unauthorized peer. The code intentionally does **not** open public ports, and cannot establish live abuse/flood behavior across actual physical hosts.

## Decisions and limitations

- P02b-1 uses **static mutual PeerId pinning** for a constrained pilot, not globally permissionless discovery. Noise authenticates a key, not an independent human, sensor or site.
- Admit only loopback IPv4 TCP for this slice. RFC1918 multi-host expansion is explicitly deferred pending physical-host tests and firewall/ops review.
- Basic connection and stream limits do not fully mitigate application message floods, Sybil peers, gossip mesh attacks or resource-manager exhaustion.
- A peer may lie that its observation is synthetic. Keep all synthetic observations away from any verified sensor index.
- Do not mark the public release gate verified. Subsequent P02b work must validate actual libp2p resource behavior, hostile peer exercises and metrics; P02c needs a deployable safe disable mechanism before any public Internet testnet.
