# M10a — permissioned private-network pilot

**Implemented:** opt-in RFC1918-addressed libp2p peers, Noise/Yamux encrypted transport, explicit peer-ID allowlists and authenticated indexer-to-indexer automatic reconciliation. A two-container integration test puts independent peers on Docker's isolated internal IPv4 bridge rather than loopback, giving each container a different network interface and SQLite state volume. All observations are **synthetic**; no live Palantiny BLE data or public sensor admission is enabled.

## Demo: two isolated network hosts

```sh
docker compose -f deploy/compose.m10.yml down -v
docker compose -f deploy/compose.m10.yml up --build --abort-on-container-exit --exit-code-from replica
docker compose -f deploy/compose.m10.yml down -v
```

The source container generates eight synthetic signed reports from two independently generated local contributor keys and persists them. The replica starts with an empty database, automatically retrieves bounded signed-report pages from the source over a separate **RFC1918** TCP connection, independently verifies signatures and writes its own SQLite index. The test is successful only when it receives eight accepted reports and its archive digest matches the source.

Docker Compose configures an **internal** bridge network, non-root processes, read-only root filesystems and separate state volumes. Both peer IDs and public contributor key IDs are exchanged through a shared **test-only coordination volume**. No private signing keys or signed report archives are passed through that volume. This shared coordination is an orchestration convenience, **not** a secure trust-distribution or peer-discovery protocol. A malicious participant able to write the coordination volume could alter the trust manifests. It must not be reused to provision production machines.

## Architectural decisions

- **ADR-M10a-1:** no wildcard, public, DNS or IPv6 listeners. Opt-in `allowPrivateLan:true` allows only a concrete RFC1918 IPv4 address. Defaults remain loopback-only.
- **ADR-M10a-2:** peers must pin *both* known multiaddresses and Noise-authenticated peer IDs. An RFC1918 address alone confers no trust. Incoming sync handlers independently validate source network address and Peer ID. Data remains allowlisted and synthetic-only.
- **ADR-M10a-3:** only indexer-to-indexer sync uses private-LAN mode. GossipSub public discovery, automatic contributor onboarding, real sensor publishing and P2P gossip beyond the sandbox remain disabled.
- **ADR-M10a-4:** Docker's isolated internal bridge demonstrates the transport across two independently networked containers, but **does not prove operation across two physical machines or the Internet**. A real multi-host pilot still needs network configuration, firewall controls, secure out-of-band peer enrollment, clock checks, reconnect testing and threat review.
- **ADR-M10a-5:** the coordination volume is trusted test infrastructure; never claim its exchanged PeerID metadata is adversary-resistant. The indexer's signed archives remain linkable and cannot be safely opened to public unauthenticated replicas.
- **ADR-M10a-6:** per-indexer SQLite stays private. No combined central indexer is used; the source container happens to be an explicitly trusted peer for this test, not a mandated public collector.

## Sanity/negative checks

`npm test` rejects noncanonical addresses, public/wildcard/link-local/multicast interfaces, private addresses without opt-in, seed addresses without explicit pinned PeerIDs, and unauthorized outbound sync. The Docker CI integration tests actual encrypted transport between two distinct non-loopback network namespaces and independent storage, and confirms signed archive agreement.

## What is still missing

This is **M10a**, not a production-ready decentralized public network. It lacks physical cross-machine verification, secure credential provisioning, NAT traversal, hostile peer/failure exercise, monitored service lifecycle, resource budgets and backup/retention policy. New real-data contributors remain blocked pending privacy and signal calibration.

**M10b next:** test two actual independently administered machines or private cloud instances with authenticated out-of-band peer provisioning, firewall-limited interfaces, interrupted-connectivity and restart recovery. Do not automatically expose `0.0.0.0` or promote this Docker test to a publicly reachable service.

Internal `pulsemesh.*` wire strings are preserved for backward compatibility despite canonical public name Palantiny-Network.
