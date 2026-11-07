# ADR-D01-001 — Offline private synthetic coverage advertisement

Date: 2026-11-07. Status: experimental schema, not activated network discovery.

An indexer can attest to a *fictional synthetic* coverage set using an Ed25519 signature over a fixed ordered payload: version, libp2p Peer ID, sorted synthetic region IDs, issued and expiry milliseconds. An independent local trust map binds Peer ID to an approved public key. The verifier rejects untrusted signers, unlisted regions, mutated fields, malformed signatures, future/expired advertisements, and lifetimes above 15 minutes. No precise geographic coordinates, raw BLE observations, network addresses or device identifiers are permitted. Maximum 16 synthetic regions per advertisement.

This is an **offline validation primitive**, not a DHT provider record, online enrollment, location proof, authority to dial, proof of actual coverage, or evidence of independent indexer operators. A trusted operator must independently verify key ownership and Peer ID binding out of band; the local map alone cannot cryptographically establish that binding. Ed25519 key management is separate from libp2p Noise identity. No automatic discovery, listeners or real sensing were enabled.

Verification: `node --test tests/private-coverage-advert.test.mjs` and full CI. Next D01 slice: explicit reviewed peer-ID/key binding and signed address policy; only then private DHT candidate discovery (D02). Release gates stay blocked.
