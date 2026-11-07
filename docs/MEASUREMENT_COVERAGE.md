# Measurement coverage semantics

The dashboard reports **released aggregate presence**, not measured sensor
uptime, and never interprets missing aggregate buckets as zero BLE activity.

`history(...)` preserves its existing `points` array for consumers and
adds `coverage` and `buckets` (one entry per expected hourly bucket).
Missing buckets use `index:null` and `status:'missing'`; genuine
zero-valued observations retain `index:0` and `status:'observed'`.
`overview()` adds 24-hour `coverage` per region. Comparisons are suppressed
when that region's recent 24-hour aggregate series is incomplete.

A released aggregate is not proof that the scanner was online for the entire
hour, nor proof that distinct signing keys represent independent sensors.
The aggregate index remains experimental, synthetic and **not a people count**.

## Next required work

Track connected sensor time, incomplete/dropped local windows and end-to-end
contribution denominators separately. Without that information, coverage
percentages describe only **published aggregate availability** and cannot
support reliable real-world occupancy or footfall claims.

No change to signed report schema or real sensor publishing is made here.
