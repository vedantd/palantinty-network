# Coding-agent context — PulseMesh

**Start here:** [Project checkpoint](docs/PROJECT_STATUS.md) (what is
implemented, what is not, technical debt, validation gaps and pending product
decisions). Also read [README](README.md), [security notes](SECURITY.md),
[measurement quality](docs/MEASUREMENT_QUALITY.md), and
[storage recovery policy](docs/STORAGE.md).

## Current operating rules

- Research prototype; **not** a real-world deployed sensor network.
- The metric is **BLE alias activity**, not human/device/occupancy count.
- Never export raw device identifiers, advertisements, payloads or location
  trails. Respect consent, minimum thresholds, coarse areas and release delay.
- Do not connect real sensor data to P2P or a public dashboard without
  explicit privacy, security and field-validation gates.
- Keep synthetic fixture generation separate from production query logic.
- Preserve SQLite transaction/ACK atomicity, replay watermarks and
  fail-closed compatibility checks.
- Missing data is unknown, never zero. Local observed-window loss is not
  scanner uptime or regional coverage.
- Prefer small, modular, independently tested PRs; run the full CI suite
  and network demos. Update status/docs as assumptions change.
- **No incentives or tokenomics** until the core network and measured
  signal are validated.

## Pending direction

**Do not assume the next feature is approved.** First discuss with the
project owner whether to prioritize field calibration and signal validity
or a distributed end-to-end demo. The checkpoint proposes field evidence
before further infrastructure.
