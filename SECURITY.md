# Privacy and security

PulseMesh is an experimental research prototype with macOS BLE sensing
and **local-only** activity aggregation. M03–M06 include a synthetic-only encrypted libp2p loopback sender, a
SQLite regional indexer, and a localhost-only fictional dashboard.
**No live sensor data is wired to network transport.**

- Raw Bluetooth identifiers, device names, Wi-Fi BSSIDs, Find My keys,
  manufacturer payloads, and individual sightings must **never** be transmitted
  or stored in the outbox.
- The explicit privacy report allowlist rejects additional fields. Two separate
  consent checks protect outbox queueing; the persistent outbox begins disabled.
- Minimum counts, time delays and quantization reduce some risks but are **not**
  anonymity guarantees. The coarse-region label and stable signing public key
  can still link observations to an operator or a place.
- Keep identity PEM files private. In M03 they are local unencrypted files
  with restrictive permissions; production should use secure OS key storage.
- No public or untrusted P2P broadcast of per-sensor signed reports is authorized.
  A confidential/threshold aggregation design must be reviewed first.
- Signatures prove key possession and report integrity, not true measurements,
  unique physical sensors, geolocation, quality, or Sybil resistance.
- Revoking consent clears **queued** observations; it cannot recall data
  that has already been delivered or retained by other systems.
- Do not enable a public map or people-count functionality without field
  calibration and an independent privacy/security review.

See [docs/SIGNED_OUTBOX.md](docs/SIGNED_OUTBOX.md).

## Hardening review

Outbound outbox queueing enforces a 15-minute minimum delay even when
local diagnostics use an explicit zero-delay override. The outbox now
rejects duplicate region/window submissions; the regional indexer also
rejects duplicate signer contributions. These are safeguards, **not**
anonymity guarantees.

See [the pre-M07 engineering review](docs/ENGINEERING_REVIEW.md) for
remaining risks and required field/privacy gates.
