# P03a — operator-local private synthetic peer enrollment ledger

**Decision ADR-P03a-001, 2026-11-07.** Build a narrowly scoped, **offline**, durable enrollment state machine before enabling any network-distributed peer registry. This allows operator review, rollback and lifecycle tests without creating an Internet admission API, uploading private keys, or silently trusting self-advertised peer IDs.

## State machine

```text
unknown ──propose──> candidate ──verified approval──> approved ──revoke──> revoked
                     └──────────────────────────────revoke────────> revoked
revoked is terminal; a replacement requires a NEW independently verified Peer ID
```

A candidate records only Peer ID, exact authorized RFC1918 IP (or localhost), pinned `/ip4/.../tcp/.../p2p/<peer-id>` seed and timestamps. Approval **requires an explicit CLI assertion** that identity was verified independently through a trusted channel. This is not itself a cryptographic certificate, human-identity validation, location attestation or permissionless onboarding. Candidates cannot connect merely by appearing in a ledger.

## CLI

```sh
npm run peer:enrollment -- init /private/pilot/host-config.json
npm run peer:enrollment -- propose /private/pilot/host-config.json VERIFIED_ID 10.10.2.9 /ip4/10.10.2.9/tcp/40123/p2p/VERIFIED_ID
npm run peer:enrollment -- approve /private/pilot/host-config.json VERIFIED_ID --verified-out-of-band
npm run peer:enrollment -- pins /private/pilot/host-config.json
npm run peer:enrollment -- revoke /private/pilot/host-config.json VERIFIED_ID
npm run peer:enrollment -- rotate /private/pilot/host-config.json OLD_ID NEW_ID 10.10.2.10 /ip4/10.10.2.10/tcp/40124/p2p/NEW_ID EXPECTED_REVISION
npm run peer:enrollment -- list /private/pilot/host-config.json
```

Use actual independently checked addresses and Peer IDs, not the placeholders. **Rotate** is an offline, one-ledger-revision preparation step: the old approved Peer ID becomes permanently revoked and the new distinct pinned Peer ID becomes *candidate*, never automatically approved or activated. Rotation requires an explicit reviewed `expectedRevision`; follow [the manual operator rotation ADR](ADR_H02B_PEER_ROTATION.md) for approval, staging and safe restart. The command reads an existing private 0600 pilot config and stores a 0600 ledger in the 0700 operator state directory. It never starts a listener or contacts another node. Only explicitly approved records appear in the `pins` export.

## Fail-closed constraints

- Exact schema and pilot ID, maximum 128 records and 16 approved peers; duplicate or revoked Peer IDs cannot be reintroduced.
- Static, explicit RFC1918 or loopback addresses; no DNS, public IP, wildcard, relays or general Internet listeners.
- Exclusive local writer lock; bounded input file; 0600 atomic rename with parent directory fsync; refuse symlinks and permissive state directory. API callers can pass an optional expectedRevision to propose/approve/revoke, checked while locked. Existing operator CLI does not require CAS. This is not anti-rollback or distributed revocation.
- Revisions advance only on valid transitions, including revocation. A corrupted ledger is not reset or silently repaired.
- A crashed writer may leave a lock that requires manual inspection; automatic lock stealing is deliberately out of scope. Atomic rename does not replace a durable, independently audited database.
- **Private runtime integrated:** the P02c synthetic pilot checks approved peer pins on startup, watches local trust drift, and shuts down on observed revision change. P03b can stage **new** approved pinned configs offline; it cannot activate them. Rotation never restarts a node or bypasses emergency stops. Revocation is still polling-based and not atomic across remote nodes.
- **No public readiness:** Open synthetic enrollment, transport admission, multi-host verification, actual revocation propagation, and real-data sharing remain blocked.

## Verification

```sh
node --test tests/p03-private-peer-ledger.test.mjs
npm test
npm run release:check -- open-synthetic-testnet --assert-blocked
npm run release:check -- public-real-sensing --assert-blocked
```

## Follow-on slices

P03b: deterministic, revision-bound local activation of pinned peers and safe restart; P03c: explicit leave/rotation protocol and recovery; P03d: limited private discovery / authenticated indexer advertisements; P04: archive operations, backup/restore and failure drills. For location queries, first implement a private, authenticated region-to-indexer directory before considering public DHT discovery. Do not confuse a test DHT with a verified region lookup service.
