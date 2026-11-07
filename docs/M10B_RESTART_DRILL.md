# M10b-2 — repeated restart/reconnect private pilot

This gate extends M10a's two-container network test to **two successive independent process runs using the same private SQLite and libp2p identity volumes**. It does not require any real Palantiny scanner data and does not claim separate physical-machine validation.

## Verified restart behavior

Run the same private Docker Compose deployment twice with distinct test generation IDs while preserving volumes:

```sh
docker compose -f deploy/compose.m10.yml down --volumes
PALANTINY_M10_RUN_ID=first docker compose -f deploy/compose.m10.yml up --build --abort-on-container-exit --exit-code-from replica
docker compose -f deploy/compose.m10.yml down
PALANTINY_M10_RUN_ID=second docker compose -f deploy/compose.m10.yml up --build --abort-on-container-exit --exit-code-from replica
docker compose -f deploy/compose.m10.yml down --volumes
```

CI runs both generations, captures the independent process logs and checks that (1) source and replica retain the same *distinct* Peer IDs across both, (2) both retain eight signed aggregate reports, and (3) the replica reports archive agreement after scheduled sync. The generation ID prevents a **stale success marker** in the shared test coordination volume from producing a false positive on restart. The two processes still execute on one GitHub runner in Docker network namespaces, not on separately administered physical machines.

## Secure physical-host deployment checklist (not yet executed)

1. Provision two independently administered hosts with firewall-restricted **WireGuard or other authenticated private IPv4 overlay addresses**, such as `10.77.10.1` and `10.77.10.2`. Choose a concrete interface IP, never `0.0.0.0`, and allow only the remote overlay peer's TCP port. Disable public Internet ingress.
2. Create a private operator data directory on **each** host and run `npm run operator:identity -- /path/to/private-dir`. Verify the two public Peer IDs over a separate authenticated channel; never copy a private key to the other machine. Use operator manifests from [M10b-1](M10B_OPERATOR_IDENTITY.md) and pin the expected Peer ID and coarse region before trusting any network connection.
3. Run a small synthetic-only **explicitly configured** indexer process bound to its own WireGuard/RFC1918 address and using the persistent key from that directory. Require allowlisted signing keys, a matching Noise-authenticated remote indexer Peer ID and private-network address. Do not reuse the test-only Docker coordination volume or its automatic manifest exchange as an enrollment mechanism.
4. Before testing network disruption, verify signed regional history already matches. Then block the overlay TCP port, publish further **synthetic** signed reports to one host, restore the overlay and check automatic reconciliation, duplicates, and archive digest agreement. Kill/restart both processes and confirm Peer IDs are unchanged and no signed reports are duplicated.
5. Collect redacted health logs (peer-ID hashes rather than private keys, never raw scans), confirm firewall rules, test denial of an untrusted peer and test restore from an operator-controlled backup.

**Important:** The currently provided `apps/m10-private-node.mjs` is a *Docker-specific test harness* requiring `/coord` and `/state`. It is **not** a secure, separately provisioned physical-host service. The physical-host operator application, authenticated provisioning workflow, real WireGuard deployment, and independent-machine failure tests are the next implementation gate, not something this document claims is completed.

## ADR-M10b-2

- Keep operator transport identity stable across process restarts and avoid copying the private key into CI logs or shared coordination.
- Bind test generations to fresh coordination messages. Stale files from previous runs are ignored.
- Preserve state across restarts, never run `down --volumes` between the two consistency checks.
- On exit, shut down the sync scheduler and libp2p node gracefully; data already committed to SQLite remains durable.
- Never interpret a two-container restart success as proof of Internet reachability, cross-machine security or real-sensor privacy.

**Next: M10b-3** — an explicit per-host runtime with separate out-of-band peer enrollment and actual two-host deployment validation. The user-facing network is still synthetic and permissioned.
