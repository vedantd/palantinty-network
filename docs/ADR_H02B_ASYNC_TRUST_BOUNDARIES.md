# ADR-H02b-003 — Recheck private peer approval around asynchronous network boundaries

Date: 2026-11-07. Scope: standalone, explicitly pinned P02c **synthetic-only** pilot.

## Threat

A private operator may revoke the configured remote peer after the publisher's initial approval check but before a libp2p dial or GossipSub publish resolves. The existing 100ms trust watcher may not run before an async operation completes; if the code trusts only its pre-check, it can log successful connection or publication after the local ledger has already recorded a revocation.

An observer can similarly receive a queued event during local approval drift and must not emit a successful receipt without checking local trust.

## Changes

1. `runPrivatePilotOperation(checkTrust, action)` verifies approval before and **immediately after** an awaited operation. It runs the post-check even if the transport action throws, letting a security failure take precedence. Before the pre-check passes, the operation is never started.
2. Wrap the standalone publisher's `node.dial` and `publishSynthetic` in this gate; the existing one-way guard calls local shutdown and `node.stop()` when it trips. Do not set the `connected` flag or emit a successful synthetic publication evidence event after a failing post-check.
3. Recheck at libp2p `connection:open` and immediately before reporting observer receipt. Invalid state triggers the same local shutdown; the observer callback refuses to emit a receipt.
4. Run an additional approval check after the publisher's post-publish grace period and remove the connection listener during shutdown.

## Tests

Positive and negative tests with real temporary operator identities and approved P03 ledger files inject revocation while a simulated awaited dial runs, unauthorized seed drift while a simulated awaited publication runs, and an unauthorized pre-check before a transport operation. Also verify a transport failure preserves the original network error when trust remains valid, while changes to local trust trip the one-way guard exactly once.

Full CI must include live P02c private-container networking and M10 reconciliation, not merely the focused tests.

## Boundaries

- Rechecking after an `await` **cannot unsend** a published GossipSub message or undo a completed dial. The primary containment remains the persistent one-way watchdog and `node.stop()`, plus operator-owned host firewall closure.
- Revocation is still based on operator-local file state and polling; without an atomic trust capability bound into the libp2p handshake and publish path, a small race remains between checks and network side effects.
- Connection-event callbacks are best-effort process hooks, not a cryptographic remote revocation or distributed ban. No proof of physical peer independence, NAT-safe public operation, signed key rotation or crash/rollback immunity.
- This change is restricted to the standalone approved private pilot; it never opens Internet listeners or accepts real BLE data. H02b remains **partial** and public release evidence remains 0/6 synthetic and 0/7 real.

## Rollback

Remove the operation gate, extra runtime checks and listener to return to the earlier watchdog-only behavior. No ledger/schema migration, new dependency or trust-policy relaxation is required.
