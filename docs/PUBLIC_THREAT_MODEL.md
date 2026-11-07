# Threat model — public participation

**Scope:** synthetic testnet first, real BLE-derived observations only after explicit separate approval. Reviewed as an engineering planning artifact, **not** an independent security audit.

| Threat | Consequence | Minimum control before open testnet | Further control before real observations |
| --- | --- | --- | --- |
| Sybil peers | Fake independent sensor presence | Peer caps, enrolment/revocation, testnet labels | Physical site and operator attestation, independence weighting |
| Malformed or oversized libp2p streams | Process crashes / resource exhaustion | Size, time, connection and stream limits; fuzz/fault tests | Monitoring + incident response |
| Eclipse / malicious discovery | Isolated or misdirected nodes | Diverse bootstrap peers, signed config, endpoint pinning | Independent sources and consistency checks |
| Archive replay/poisoning | Fabricated trends | Verify envelopes, unique report IDs, backfill bounds | Attested data collection and independent calibration |
| Exposed signing metadata | Link contributors to time and region | Synthetic-only public GossipSub; private indexer sync ACL | Suppression, retention, release delay, privacy review |
| Claimed sensor location | Geographic misinformation | No real site assertions | Out-of-band location/site verification |
| Lost or compromised node key | Impersonation or network disruption | Owner-managed identity, rotation and revocation process | Incident drill, backup, stronger key isolation |
| Hostile volunteer clients | Abusive requests / denial of service | Admission rules, quotas, telemetry and emergency disable | Public service operational review |
| Consent withdrawal vs replicated history | Data persists after local opt-out | No real data on synthetic track | Document replication, retention and attainable deletion semantics |
| Incorrect sensing proxy | Incorrect claims about people | Synthetic demo warnings | Held-out site calibration; no people-count assertions |
| Supply-chain compromise | Malicious community binaries | Dependency review, versioned releases, signed artifacts | Independent security check and release rollback |

**Trust boundaries**

- Local BLE sensor/OS: raw observations remain on the user's device.
- Local privacy gate: only delayed, coarse aggregate reports are eligible for any future real-data transfer.
- GossipSub/testnet: hostile peers can read public synthetic messages; a Noise connection **does not** hide payloads from subscribed peers.
- Regional indexer: signed report archives are confidential and may reveal operator metadata, even when coarse regions are used.
- Dashboard: only privacy/quality-reviewed released regional aggregates, never per-signer archives.

**P00 scope:** document threats and keep release gates blocked. Security work, pilot validation and incident procedures remain required. Do not treat this document as permission to expose the software to unrestricted network participants.
