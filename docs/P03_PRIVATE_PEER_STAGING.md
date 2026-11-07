# P03b — explicit local activation staging for approved synthetic peers

**Decision ADR-P03b-001:** Do not connect the P03a enrollment ledger directly to a running libp2p allowlist. First require a **revision-bound, operator-reviewed, private staged configuration**. This permits a predictable process restart and keeps the existing emergency-stop marker authoritative.

`src/p03-peer-staging.mjs` takes a private current P02c host config, one approved P03a Peer ID, the ledger revision last reviewed by the operator, and a brand-new output filename in the private 0700 operator state directory. It refuses unknown, candidate or revoked peers, stale revisions, self-identity pins, unsafe output paths, existing files, and any implicit expansion of a localhost-only listener to a private LAN. The result is another private 0600 config validated by the existing P02c host config schema.

```sh
npm run peer:enrollment -- pins /private/pilot/host-config.json
npm run peer:stage -- /private/pilot/host-config.json VERIFIED_PEER_ID 2 /private/pilot/staged-config.json
# Manually inspect the new config, independently confirm remote identity,
# check overlay firewall settings, stop the existing local pilot,
# and explicitly restart with the new config when approved.
```

**Important:** The CLI never changes the active config, starts a listener, resumes a disabled pilot, copies a key, or activates a connection. It reports `activated:false`. The `PILOT_DISABLED.json` stop marker continues to block all pilot startup, including with the staged config, until a separate explicit manual review/resume step is completed. A revoked Peer ID cannot be staged as approved.

The one-remote-peer standalone P02c pilot config is deliberately unchanged. The P03a ledger can hold multiple approved candidates; P03b stages exactly **one** for that pilot. This is not production open enrollment, distributed governance, public DHT discovery, or an automated trust update.

Verification: `node --test tests/p03-peer-staging.test.mjs`, `npm test`, and both release profiles' `--assert-blocked` checks. Next P03c should cover reviewed identity replacement, offline pin revocation reconciliation and restart evidence; later P03d can investigate private authenticated indexer-service advertisements. No public participation or real sensing enabled.
