# H1a — reproducible and integrity-checked Node dependency installation

**Status:** merged as [PR #70](https://github.com/vedantd/palantinty-network/pull/70), squash commit `94fbddc0243831c4cc14174f7f5da0f0d37da689`; full [GitHub Actions run 42373905601](https://github.com/vedantd/palantinty-network/actions/runs/42373905601) passed **182/182 tests** and both Docker integration scenarios. **Scope:** reproducible CI and private synthetic container installs, not a tagged public release or security certification. Public synthetic and real-sensing release gates remain blocked.

## Why this matters

Previously this repository had no `package-lock.json` in source control. CI and Docker both ran `npm install`, which could select different transitive versions on different days. The result was nonreproducible builds and an unreviewable software supply chain. The H1a change commits a npm lockfile and uses `npm ci --ignore-scripts --no-audit --no-fund` in CI and both Docker images, refusing silently inconsistent manifests.

## Lockfile provenance and review

1. A clean GitHub Actions Ubuntu runner using Node 22 resolved `package-lock.json` from the then-current project manifest in [CI run 42373300374](https://github.com/vedantd/palantinty-network/actions/runs/42373300374); its one-day artifact is `h1-package-lock`.
2. The artifact contained **132** package entries (root plus 131 resolved tarballs) using lockfile version 3. All 131 dependencies had SHA-512 integrity metadata, tarball URLs under `https://registry.npmjs.org/`, and exact versions. The package-lock bytes hashed to **`1480492b81aeed9167a605b9c738392c384eb9cf8b7622b674deb516a8feed12`** with SHA-256.
3. A narrowly restricted **trusted branch-only** temporary GitHub workflow used `npm install --package-lock-only --ignore-scripts` and committed exactly the same SHA-256 lockfile to the H1a feature branch; see [bootstrap run 42373521028](https://github.com/vedantd/palantinty-network/actions/runs/42373521028). The temporary write-permission workflow was **deleted before merging**. The normal PR workflow retains only `contents: read` permissions.
4. `src/dependency-lock-check.mjs` checks root dependencies match the manifest and every installed transitive dependency has SHA-512 integrity and a resolved npm registry HTTPS URL. `npm ci` ensures lockfile/manifests agree on a clean install.

Run locally after cloning:

```sh
node --version  # 22+
npm ci --ignore-scripts --no-audit --no-fund
npm run build:lock-check
npm test
```

Both private synthetic Dockerfiles now copy `package.json` **and** `package-lock.json` into images and run `npm ci --ignore-scripts --no-audit --no-fund`. Neither image should have an interactive installer, automatic public listener, or live real BLE publishing.

## Limits and follow-up H1b

- SHA-512 registry integrity protects against unexpected tarball bytes for *the pinned package*, but **does not make the package itself trustworthy**. Reviewed direct and transitive versions still need vulnerability/license/maintainer assessment; active advisories should trigger action.
- GitHub `actions/checkout@v4` and `actions/setup-node@v4` and Docker `node:22-bookworm-slim` tags are still mutable. H1b must pin reviewed immutable SHAs/digests, generate SBOM, define security update policy, release signing/hashes and make deterministic tagged artifacts across hosts.
- `--ignore-scripts` is a deliberate policy and could break a future package requiring installation scripts; add explicit exceptions with security review rather than removing the flag.
- The runner's operating system/runtime, host firewall, independent multi-machine evidence and admission safety remain separate prerequisites. Dependency locking alone does **not** satisfy the `release-supply-chain` gate.

**Related:** [issue #65](https://github.com/vedantd/palantinty-network/issues/65), [release slices](PUBLIC_RELEASE_EXECUTION_PLAN.md), [hardening audit](HARDENING_AUDIT_2026_11_07.md).
