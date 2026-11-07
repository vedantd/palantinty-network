# ADR-D01b-002: Cryptographically bound libp2p coverage claims

**Date:** 2026-11-07. **Status:** private synthetic protocol only; not a public provider system.

## Motivation

The existing D01b offline fictional-region advertisement uses a *separate* Node.js Ed25519 signing key and a local PeerID→public-key assertion. That is useful for testing signed payloads, but it does not prove the signing key belongs to the actual Noise-authenticated libp2p identity. Before DHT discovery, that binding must be explicit.

## Protocol contract

`src/private-peer-bound-coverage.mjs` signs the canonical D01 payload with the **libp2p Ed25519 private key** used for the node identity. The signer checks `peerIdFromPublicKey(privateKey.publicKey)` matches `payload.peerId`. The payload contains a strict version, a Peer ID, 1–16 sorted **canonical fictional** region IDs, and issue/expiry timestamps (maximum 15 minutes). Signed bytes use the domain-separated `palantiny.private-indexer-coverage.peer-bound.v1\0` prefix so legacy offline signatures cannot be substituted.

The wire object is exactly `{payload,publicKey,signature}`. The public key is protobuf-serialized and base64-canonical; the Ed25519 signature is canonical base64. The verifier derives the signer Peer ID from that public key, checks it matches `payload.peerId` and the actual **Noise-authenticated remote Peer ID**, and requires explicit local operator approval. No on-network self-description can add its own key to this local trust list.

- Reject unsigned, unknown, future/expired, mismatched-region, noncanonical-region, oversized, wrong-algorithm, wrong-peer and replayed old claims.
- Do not trust a DHT provider record as a signature, certificate, physical location, region proof or operator independence proof.
- Sending the public key on a private libp2p stream does not reveal the private key.
- Real geographic mapping, privacy review, public admission, outbound public interfaces and real BLE data remain disabled.

## Next milestone

The private D02a adapter will use existing Kademlia **content-provider** discovery for a deterministic fictional region CID (not `findPeer(knownPeerId)`), then contact each candidate peer via a bounded Noise-encrypted application stream, read this claim and verify it against that authenticated peer. Two separately generated test indexer identities should be found without a shared region-to-indexer list. The private client still holds a trust allowlist and a known bootstrap peer. This does not create a permissionless open testnet.

Public synthetic launch gates **0/6**, real sensing **0/7**, D01b remains **partial** until network discovery and signed address/coverage policy are verified.
