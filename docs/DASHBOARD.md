# M06 — Synthetic regional Insights dashboard

Run `npm install && npm run dashboard`, then open
`http://127.0.0.1:4177`.

The server is **localhost-only**, read-only and never connects to the public
Internet. It creates a disposable SQLite regional indexer, generates 48
hourly windows of **fictional** Ed25519-signed activity reports for five
fictional districts, and runs the same M05 signature and replay verification
pipeline. The temporary database and keys are deleted on shutdown.

## Visible features
- Five selectable *schematic* regions (not real map coordinates).
- Regional index, reporting coverage, change versus same hour yesterday.
- Interactive 24-hour and 48-hour history, with previous-day overlay.
- Missing/limited contributor coverage, and synthetic-only warnings.
- Read-only endpoints `GET /api/overview` and
  `GET /api/history?region=market-lane&hours=24`.

## Privacy / security
The UI does not expose per-signer keys, reports, BLE identifiers or exact
sensor positions. The underlying indexer still stores per-signer synthetic
contributions; this is not anonymous aggregation or production deployment.
Two authorized keys per cell is a suppression threshold, **not** a formal
privacy guarantee or evidence of two independent sensors. No live Palantiny
or CoreBluetooth input is connected to the network or dashboard.

The server binds only to 127.0.0.1. It has no authentication and must not
be exposed through a proxy, public IP or tunneling service. Production
deployment requires authentication, authorization, rate limits, anti-Sybil
design, and independent privacy review.

## Verification
`npm test` includes real SQLite seed, coverage suppression, history and
read-only HTTP endpoint checks. GitHub CI is the integration gate. Browser
rendering can be tested in a sandbox using synthetic fixtures.

## Next
Field calibration against manual passage counts, privacy-preserving
multi-operator aggregation, and only then a limited real-sensor trial.
