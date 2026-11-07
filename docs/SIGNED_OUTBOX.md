# M03 — Signed reports and a durable local outbox

**Scope:** this module generates **synthetic or separately approved aggregate
reports** and queues them locally. There is **no P2P transport, indexer, or
network publisher**. No physical sensor is automatically connected to M03.

## Demo

Node.js 22+ with its built-in experimental `node:sqlite` module:

```bash
npm test
npm run outbox:demo
```

The demo creates an ephemeral Ed25519 identity and SQLite outbox in a private
temporary directory, enables consent explicitly, queues an eligible
**synthetic** aggregate and verifies its signature. It does not send traffic.

## Flow

```text
Local BLE window (sensitive alias sets stay in memory)
   -> current privacy gate (opt-in, minimum threshold, 15min delay)
   -> strict allowlisted report
   -> canonical signed envelope (Ed25519; sequence, report ID)
   -> durable SQLite outbox (mode 0600; opt-in; capacity bound)
   -> future authenticated confidential transport (NOT IMPLEMENTED)
```

M03 has two *independent* opt-in checks: the outbox's persisted consent
setting and the per-report policy's `consent:true`. Fresh databases start
disabled. Calling `setConsent(false)` clears all **queued** reports and
persists the disabled state across restarts. It does not revoke data already
acknowledged or delivered elsewhere. Acknowledged reports remain stored in
this prototype for auditability; retention/cleanup and legally effective
deletion require explicit future policy.

### Report contract

The Ed25519 signature covers `body`. The body contains a version, stable
public-key hash, public key, monotonic local sequence, deterministic report
ID, and **only** the fields allowed by `pulsemesh.activity.v1`:

- `area`: coarse operator-approved region label
- `bucketStart`: UTC window start as milliseconds
- `bucketSeconds`
- `activityIndex`: quantized experimental BLE alias activity
- `metric`: `ble_alias_activity`

The protocol rejects unknown fields, preventing raw Bluetooth identifiers,
device names, payloads, Wi-Fi networks and RSSI histories from entering
signed envelopes. Signatures allow **integrity and proof of key possession**,
not proof of device ownership, sensor location, coverage, or actual foot
traffic. The public key is stable and linkable. A future recipient must
enforce report-ID and sequence replay rejection.

### Security and reliability limits

- Files use private directories (0700) and file mode 0600. Private keys are
  unencrypted at rest in this prototype. Production should use OS-backed
  secure storage/Keychain where possible.
- SQLite `node:sqlite` is experimental on Node 22. Do not claim a production
  compatibility guarantee without further testing.
- The pending queue has a configurable capacity, backoff retry timestamps,
  idempotent acknowledgment, and atomic sequence allocation + enqueue.
- The outbox currently has no background sender and `acknowledge()` is a
  local API for tests/future verified delivery—not evidence that anything
  was transmitted.
- A *public* GossipSub broadcast of per-node reports is not allowed by
  this implementation. Even aggregates can expose physical presence and
  operator patterns. A trusted or cryptographically private aggregation
  architecture is required before enabling networking.
- Signatures alone do not protect against Sybil identities or fabricated
  measurements.
- This module is separate from `docs/CALIBRATION.md`; an unvalidated
  signal must not become a people-count API.

## Next acceptance gate

After M02 calibration, implement an authenticated **synthetic-data-only**
three-node exchange and an ingest verifier with replay checks. Do not
enable real-world report broadcast without review of location privacy,
threshold aggregation, and contributor linkability.

## Revocation and retained history (M09 privacy hardening)

Signed envelopes can remain locally in the ACKed archive solely to help another trusted indexer catch up. **Turning consent off now deletes all local outgoing rows, including ACKed historical envelopes, in the same transaction as the consent flag update.** Re-enabling consent starts a fresh local history while preserving the monotonically increasing signing sequence. This is not a remote deletion command: a report already distributed to independent indexers cannot be withdrawn by deleting the contributor's local copy. Such deletion/retention guarantees have not yet been designed.
