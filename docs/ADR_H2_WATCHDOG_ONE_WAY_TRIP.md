# ADR-H2-001 — One-way private pilot watchdog trip regression coverage

Date: 2026-11-07. Status: proposed, test-only incremental H2 slice.

## Threat and invariant

A transient corrupt local config or an unauthorized pinned peer address change must not be treated as harmless merely because the on-disk config is restored before the next check. Once a running pilot watchdog observes invalid trust state, it must remain tripped until the process is restarted under explicit operator review. This prevents accidental in-process reauthorization by stale configuration rollback.

## Decision

Retain the existing one-way `watchApprovedPrivatePilot` behavior and add positive and negative regression tests. Tests create a real temporary operator identity, approved ledger and private localhost-only config; check initial approval, corrupt/alter config, assert trip callback once, restore original config and prove a fresh standalone approval may pass while the *existing* guard remains permanently tripped.

## Limits

This does **not** close the polling TOCTOU gap, make ledger mutations atomic, prevent hostile filesystem writes, or prove remote connection teardown. A process that never observes a transient change may continue until its next poll; the operator still needs OS firewall containment and emergency stop. Transactional ledger commits, tombstoned rotation, and handshake/publish race tests remain issue #66. No public listener, public enrollment, real BLE publishing or release gate change.

## Verification

Run `node --test tests/p03-runtime-trust-guard.test.mjs`, then full GitHub workflow. Merge only after complete green workflow. Evidence status is pending until GitHub Actions confirms.
