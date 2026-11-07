# Measurement-quality boundaries

`LocalActivityPipeline.measurementQuality()` derives a frozen, numeric-only
snapshot from the existing local diagnostics. The pure function is
`summarizeLocalMeasurementQuality(diagnostics)` in
`src/measurement-quality.mjs`.

The summary distinguishes **observed windows**, **known lost windows**,
**pending windows**, **event acceptance**, and **policy/consent filtering**.
Known loss includes incomplete windows, pending-queue overflow and
aggregator retired-buffer overflow. Policy rejections and consent revocations
are accounted for separately, not counted as sensor loss.

**Critical limitation:** observed-window loss percentage is NOT wall-clock
sensor coverage. Silent periods can generate no observed windows at all.
Consequently `uptimePct` and `wallClockCoveragePct` are always `null`,
and an empty session is `insufficient_evidence`, never 100% healthy.

This is deliberately **local-only**: it is not a new signed network report,
not a per-node regional dashboard endpoint, and not an attested measurement
of scanning hardware. The regional dashboard continues to expose aggregate
bucket presence, a separate concept. Do not merge the two denominators or
claim they represent human footfall.

Future work should establish independently timed scanning sessions,
radio-state tracking and validated sensor coverage, then design a privacy-
reviewed regional quality release gate. Do not publish individual operator
health histories or stable identifiers.
