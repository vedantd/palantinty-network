# Refactor notes — P0 reliability and modularity

This change deliberately avoids a large architecture rewrite.

## Boundaries

- `src/private-transport.mjs` depends on the receiver's
  `ingest(envelope)` method, not on specific SQLite or in-memory classes.
  Authorization, validation and durable ACK semantics remain the receiver's
  responsibility. This interface is **not** an authorization mechanism.
- `LocalActivityPipeline.diagnostics()` exposes an immutable snapshot:
  `overflowDropped`, `incompleteWindows`, `policyRejected`, `released`,
  `revokedPending`, `pending`, `connected`. These are local quality
  diagnostics, not an Internet-facing telemetry API.
- Async transport fixtures now wait for their test callbacks before deleting
  temporary signing identities.

## Tests and remaining limitations

The new pipeline tests exercise real bounded queues, incomplete windows,
consent revocation and immutable diagnostics, rather than mocking the
aggregator. Existing M04/M05 network integration tests must continue to
pass after removing concrete class coupling.

This does **not** eliminate all data loss: `ActivityAggregator` also has
a bounded closed-window buffer and a separate `droppedClosedWindows`
counter. Before any real data-quality claim, combine those metrics into
end-to-end coverage reporting and propagate missing-window status to the
regional query model.

Further isolated PRs should add durable schema migrations, retention and
corruption recovery; split synthetic dashboard fixture creation from query
logic; and introduce independent reference tests for calibration statistics.
Do not connect real BLE observations to remote transport until the privacy
and field calibration gates are satisfied.
