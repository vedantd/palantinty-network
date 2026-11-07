# Local sensor health diagnostics

The `LocalActivityPipeline.diagnostics()` snapshot now includes
`acceptedEvents`, `rejectedEvents`, `connections`,
`disconnections` and `retiredWindowsDropped`, alongside existing
pending-window, incomplete-window, policy rejection and release counters.

These are **local, numeric-only counters**. The diagnostics API does not
contain BLE aliases, raw advertisements or device identities. A rejected
event may mean invalid input, an out-of-range timestamp, a disconnection or
an aggregator capacity limit. The counters are cumulative since process
start, not durable uptime records.

`retiredWindowsDropped` measures loss in the aggregator's bounded
closed-window buffer, which is distinct from `overflowDropped` in the
pipeline's pending-release buffer. Neither should be silently interpreted
as zero activity. Calling `sensorConnected()` twice without a disconnect
now raises an error; duplicate disconnects are harmless.

## Remaining work

This is **not** an end-to-end sensor uptime percentage. We do not yet have
continuous radio health, wall-clock connected duration, scan coverage per
bucket or an authenticated and privacy-reviewed contribution health schema.
Keep these diagnostics local until that design is reviewed. The dashboard's
existing aggregate coverage describes released aggregate availability, not
physical sensor uptime or people counts.
