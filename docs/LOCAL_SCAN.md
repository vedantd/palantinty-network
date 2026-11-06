# M01b: repeatable macOS Bluetooth scan

This diagnostic launches the **existing Palantiny native macOS sensor** through
a permission-restricted local Unix socket. No external network publishing is
implemented or enabled.

## Requirements

- macOS 14+ and Bluetooth permission for the Palantiny sensor.
- Node.js 22+.
- Palantiny cloned as a sibling checkout (`../palantiny`).
- Bun and Xcode Command Line Tools to build Palantiny's signed sensor.

Build the native app in your Palantiny checkout:

```bash
cd ../palantiny
bun install
bun run sensor:build
cd ../pulsemesh
```

Run the tests, then a diagnostic scan:

```bash
npm test
npm run scan -- --seconds=120 --window-seconds=20
```

If Palantiny is not installed as a sibling, supply its **built** app path:

```bash
npm run scan -- --seconds=120 --window-seconds=20 \
  --app=/absolute/path/to/palantiny/native/macos/build/palantiny-sensor.app
```

The scan begins after the sensor connects. It ignores the partially sampled
first clock-aligned bucket and prints only aggregate counts and radio status,
never Bluetooth IDs, names, payloads, or Wi-Fi network identifiers. Both the
socket and its containing temporary directory are private. The sensor process
normally exits when its socket closes.

The CLI runs standalone, **without running the Palantiny server or UI**.
To validate the simultaneous relay + Palantiny dashboard, use
[PALANTINY_INTEGRATION.md](PALANTINY_INTEGRATION.md).

## Interpretation

- `sessionUniqueAliases` means rotating identifiers seen during the test,
  **not** distinct physical devices or people.
- `activityIndex` is a quantized, experimental BLE activity signal.
- `localGate` is an instantaneous on-device diagnostic evaluation, not a
  network release.
- `defaultGate` retains the normal 15-minute network-release delay.
- `droppedClosedWindows` should stay zero for a standard 120-second scan.
- `complete: false` means the scan was interrupted or the sensor disconnected.

No raw observations or logs are written to disk by the command. If you
redirect stdout yourself, the resulting log contains only summaries and
runtime errors. Treat device-density summaries as potentially sensitive.

## Caveats and next verification

The scan command has been tested with simulated sensor events. It has **not**
yet been run on real Mac hardware via this exact command. We also need to
validate macOS permissions and termination behavior in practice.
