# ADR-D02b-1 — Live authenticated endpoint binding for private DHT indexer restarts

**Date:** 2026-11-07. **Stage:** synthetic-only localhost proof; broader D02b and H03 exit evidence remain incomplete.

## Problem

In a DHT, a stale *provider record* may still name an approved libp2p Peer ID and a previous TCP port after its operator restarts. A client could accept an unexpired signed regional coverage claim from the previous node incarnation and later query the same Peer ID at a newly discovered address without a fresh signed coverage check. Neither a DHT record nor a previously accepted signature proves a *current* service endpoint or that an indexer is still online.

## Decision D02b-1

- Keep all D02a private fictional CID discovery and out-of-band indexer approval requirements. Never infer trust or region correctness from Kademlia alone.
- DHT provider addresses are **untrusted, potentially stale routing hints**, never authorization. The client must actually establish a **currently live Noise-authenticated connection** to the exact locally approved Peer ID, then obtain a **fresh signed coverage response** from that peer over the connection. All addresses remain strict loopback; reject unknown keys, public/mixed addresses, missing live authenticated channels and invalid signed coverage. A cached old DHT port cannot authorize a query or replace fresh proof.
- Record the **actual authenticated connection's remote endpoint**, *not necessarily the stale DHT hint or the indexer's advertised listening port*, and short-lived coverage issuance in the in-memory D02a discovery result. An inbound connection may report an ephemeral TCP source port rather than the remote peer's listener port. D03 queries must find a live connection with that **same session remote endpoint**; after a restart at a new listener and a new authenticated session, the pre-restart discovery snapshot cannot be reused even if the old coverage TTL has not expired.
- A fresh signed coverage handshake after provider reannouncement is mandatory before recovering a stopped indexer. The private D03 query still verifies a separate signed, nonce-bound aggregate response; endpoint binding does **not** replace signature validation or the minimum two-indexer threshold.
- No public bootstrap, real geographic cells, raw BLE capture or approval-by-DHT. Keep retry budgets bounded and errors fail closed. Physical-host independence cannot be inferred from unique keys or multiple localhost ports.

## Acceptance

The new `network:region-restart` five-instance localhost experiment starts three approved private indexers, each with its own durable SQLite signed-report archive, then stops one. The two surviving indexers continue to return a consistent, degraded private quorum. The stopped indexer is reopened from the same private Ed25519 key and same SQLite archive **on a different loopback port**. The new instance reconnects to the bootstrap/router and advertises the fictional region CID. The *same client* rediscovers and verifies all three current signed endpoints, successfully reads consistent aggregates from all three, and refuses an attempt to reuse the old coverage snapshot. No central region-to-indexer directory or direct re-seeding of the querying client with the restarted indexer's address is allowed.

Negative tests reject missing authenticated connections, fake/unknown IDs, public IPs and reuse of a previous signed endpoint after restart. A stale DHT address is explicitly allowed **only as an untrusted hint** when fresh direct Noise authentication and signature verification establish the new port. Existing D03 tests cover wrong signatures, nonces, stale rows and insufficient quorum. Acceptance requires full `npm test` and GitHub Actions including all synthetic demos and isolated private Docker integrations.

## Risks, rollback and remaining work

This implementation binds a signed coverage claim to a live private endpoint **during lookup**. The first CI attempt exposed that Kademlia may continue to return an old port even after a provider reannounces; therefore DHT address freshness itself is **not proven or required**. Stale or poisoned provider addresses remain only routing hints; no observation or authorization is accepted without fresh authenticated direct exchange. It does not prove DHT eventual convergence under partitions, WAN reachability, NAT/relay traversal, operation under active eclipse/Sybil attackers or real cross-host restart. Endpoint and Peer ID matching is not a substitute for peer-revocation authority, quorum independence or application availability monitoring. The client must refresh discovery after address changes.

Rollback by reverting the D02b endpoint-binding commits and removing the new private demo CI step; no new database schema or public protocol version is introduced. Formal D02b stays partial only after merge/CI; H03 physical-host acceptance and all six synthetic plus seven real-sensing launch gates remain blocked.
