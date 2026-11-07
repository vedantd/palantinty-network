# H1b-1 — immutable CI actions and locked dependency SBOM

**Status:** PR candidate, requires CI verification. This is a **first part** of the release supply-chain program, **not** completion of the public `release-supply-chain` gate.

## Decisions

1. Pin GitHub Actions `actions/checkout`, `actions/setup-node`, and `actions/upload-artifact` to **specific 40-character commit hashes**, not mutable major tags. Versions obtained from official GitHub tag refs on 2026-11-07: checkout v7.0.1 `3d3c42e5aac5ba805825da76410c181273ba90b1`; setup-node v7.1.0 `949feb2413d6458794dcd2491c4babbbce0c15c1`; upload-artifact v7.0.2 `cf430e030ddbb5b0abf93d22962f4752f3646cd9`. The official GitHub release pages were inspected for major-version changes; hosted Ubuntu runners must be compatible with Node 24 action runtimes.
2. Keep `permissions: contents: read`. No push, secrets, release or workflow write permission in the standard PR job.
3. Use the H1a `package-lock.json` installed with `npm ci --ignore-scripts` to generate **CycloneDX** components using native `npm sbom --sbom-format=cyclonedx --omit=dev`.
4. Upload the generated SBOM as a **14-day CI artifact**. This is inventory evidence only. The artifact has no signing, protected workflow provenance, immutable timestamp or released binary attestation.
5. Test action pinning, token scopes and SBOM generation in CI and add a narrow regression test.

## Acceptance

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm sbom --sbom-format=cyclonedx --omit=dev > npm-sbom.cyclonedx.json
npm test
```

The GitHub Actions job must also pass the complete simulated P2P/container suite. If CycloneDX generation or new action runtimes fail, fix without weakening permission/supply-chain requirements.

## Still required before public release

- Pin base Docker image **digests** rather than mutable `node:22-bookworm-slim` tags and document CVE update cadence.
- Add machine-readable dependency audit results and triage policy for findings, including direct and transitive packages. SBOM presence does **not** mean the packages are safe.
- Produce a reproducible, signed, immutable **tagged** release artifact and verify published binaries match expected source/code, with an incident response/rollback drill and independent review.
- Ensure two-host independent deployment and all other open synthetic release gates are satisfied. No public listener/real BLE input is enabled by this change.

**Tracking:** [#65](https://github.com/vedantd/palantinty-network/issues/65) · [H1a lockfile](H1_REPRODUCIBLE_BUILDS.md) · [execution plan](PUBLIC_RELEASE_EXECUTION_PLAN.md).
