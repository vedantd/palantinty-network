# Engineering review — pre-M07 (2026-11-06)

This is an audit of the implemented repository, not a certification of
privacy, security, or measurement accuracy.

## Verified baseline

- GitHub Actions for M06 `main` (`a024aa8`) succeeded.
- The repository has 49 passing tests at the audited baseline.
- M01 BLE hardware was previously exercised on a contributor Mac; it was
  **not** re-run on hardware during this review.
- M04/M05 libp2p tests run on a **single CI machine** using loopback only.
- M06 uses synthetic signed reports, fictional zones and a localhost-only
  HTTP server. No real field-data pipeline to the public dashboard exists.

## Findings and actions

| Severity | Finding | Action |
| --- | --- | --- |
| High | Local diagnostic `delayMs:0` was also accepted by the durable outbound outbox | Enforce at least 15 minutes at the outbox boundary, regardless of diagnostic policy |
| Medium | Outbox could enqueue multiple signed reports for the same coarse region/time window | Add a SQLite unique expression index, explicit duplicate rejection, and restart tests |
| Medium | M04 in-memory ingest allowed one signing key to overwrite its contribution for a cell using a newer sequence | Reject a second contribution from the same key/window |
| Medium | README roadmap and security notes lagged M04–M06 | Refresh scope and architecture descriptions |
| Medium | Network receiver type-checks two concrete ingest classes | Future refactor to a narrow `ingest(envelope)` interface |
| Medium | Transport ACK is unsigned at the application layer and must be bound to the expected libp2p peer | Keep peer configuration explicit; add peer mismatch/stream timeout adversarial tests before Internet trials |
| Medium | Signed contributor identity is linkable and does not attest to hardware or location | Block real-world public publishing pending independent privacy/anti-Sybil review |
| Medium | SQLite indexer retains per-signer data without retention schedule | Add documented retention policy, migrations and encrypted storage before real deployment |
| Medium | Dashboard is unauthenticated, intentionally localhost-only | Do not expose via reverse proxy, tunnel or public bind |
| Low | No lockfile, reproducible install or dependency scanning in CI | Schedule dependency-lock and CI hardening before external deployments |

## Lessons learned

1. **The outbound boundary is a security boundary.** A local diagnostic
   override must never silently become a network publication override.
2. **Deduplication has two levels.** The contributor should not queue
   duplicate windows; the receiver must still reject replay after a crash.
3. **A signing key is not a physical sensor.** A minimum number of keys is
   not anonymity, independent coverage or resistance to fabricated readings.
4. **A successful integration test is bounded evidence.** Three processes
   on one loopback machine prove protocol interoperability, not distributed
   Internet operation.
5. **Keep sensor data and network transport separated.** Palantiny is an
   upstream local sensor, not a distributed identity provider.
6. **Synthetic dashboards must remain clearly synthetic.** Avoid
   georeferenced, live or people-count claims until a measured field pilot.

## Remaining gates before M07 field pilot

- Controlled same-location BLE/manual passage count comparisons across
  multiple sessions, time blocks and conditions.
- Stronger coverage and privacy review; define how sparse regions and
  correlated or malicious contributor keys are handled.
- Durable indexer schema migration/retention policy, key management,
  operational metrics and error budgets.
- Multi-host network tests and explicit consent UX, never public per-node
  broadcasts.
