# ADR-D01a-001 — Canonical fictional region identifiers for private routing tests

**Date:** 2026-11-07 · **Stage:** D01a **partial**, synthetic-only. No real location lookup, geographic cell selection, permissionless DHT, or public release is authorized.

## Motivation

Different indexer operators must calculate the same region identifier and the same provider-discovery lookup input. Previously the D01b coverage prototype accepted flexible `syn:fictional-a` strings, which were useful for offline signature verification but lacked a canonical region-key generator. This slice supplies stable *fictional* keys and a deterministic, domain-separated digest without collecting locations.

## Canonical synthetic v1 grammar

- Call `syntheticRegionKey({scenario,cellIndex})`, with `scenario` an ASCII lowercase 3–12 character letter-first alphanumeric *fictional simulation name* and `cellIndex` a whole number 0–63.
- Produce `syn:<scenario>-c<two-character-base36-index>`; for example `syn:demoarea-c00`, `syn:demoarea-c1r`. Key strings are strict and canonical; uppercase, URLs, coordinates, extra object fields, oversized cells, unbounded lists and alternate spellings fail closed.
- `syntheticCoverageRegions({scenario,cellIndices})` emits 1–16 unique canonical identifiers, sorted for existing Ed25519 coverage signature payloads.
- `syntheticRegionRoutingDigest(key)` produces a 32-byte SHA-256 digest using a fixed domain prefix `palantiny.synthetic-region-lookup.v1\0`. A lookup digest is **not** a CID, a verified DHT provider advertisement, a credential, or evidence of actual geographic coverage.

## Scope and compatibility

The new canonical routing helper deliberately does **not** accept old demonstration labels such as `syn:fictional-a`; those legacy fictional labels remain accepted by `src/private-coverage-advert.mjs` for existing offline tests. No wire schema is silently migrated or previously signed advertisement reinterpreted. Future private regional discovery will use the canonical generator on *both* indexers and clients and will bind signed coverage keys and libp2p Peer IDs explicitly.

A scenario/cell label is **not a location**; it could be misused by an operator to encode meaningful names. Hashing a low-entropy label is not private against dictionary attacks. This module has no latitude, longitude, real coordinates, H3/geohash conversion, sensor statistics, physical-site proof, or human-count semantics. Designing real geographic coarsening, sparse-cell suppression, time delay, consent, safe retention and privacy review remains a separately gated scientific and legal task.

## Testing and operational restrictions

Node's built-in tests verify roundtrip vectors including boundary 63, canonical rejection, strict object fields, sorted/limited lists, signing and validating a generated synthetic coverage record against a local Ed25519 trust key, and deterministic domain-separated 32-byte digests. No new dependency, socket/listener, remote peer enrollment, or real BLE report flow is introduced.

**Next:** finish reviewed libp2p Peer ID/coverage signer binding (D01b), and only then wire private Kademlia regional candidate lookups (D02a). H02b still needs independent host revocation testing. Public release gates stay synthetic 0/6 and real 0/7.
