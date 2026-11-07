# P02c-2 — independently administered private-host synthetic pilot

**Status:** reusable operator commands, strict private config, persistent keys and reconciliation of observed delivery records. **No independent physical hosts were operated as part of this PR.** Public participation and all real BLE publishing remain disabled. Do not treat the included process tests or unsigned JSON logs as proof of two-host independence.

## Requirements and trust boundary

Use **two separately administered machines** with Node.js 22+, a private IPv4 overlay such as WireGuard, strict operating-system firewall rules, and independent, owner-controlled state directories (0700). No public/wildcard TCP binding, Internet bootstrap, shared coordinator, remote enrollment, or real BLE data. Both operators must independently exchange and verify public Noise Peer IDs via a trusted external channel. No one copies a private key to another host.

This standalone synthetic GossipSub pilot **does not use the P02c-1 Docker coordination volume**, does not discover peers automatically, and does not connect to the real sensor pipeline. The pilot's fixture signer is locally created and never exported; it signs intentionally fictional coarse reports.

## One-time setup on each host

```sh
git clone https://github.com/vedantd/palantinty-network.git
cd palantinty-network
npm install --no-audit --no-fund
mkdir -m 700 -p /srv/palatiny-pilot
npm run operator:identity -- /srv/palatiny-pilot/operator-identity
```

The operator's Peer ID is printed locally. Verify the other operator's public Peer ID and fixed overlay IP address over a trusted out-of-band channel. Restrict each machine's firewall to the other participant's *overlay address* and a single chosen TCP port. Verify the tunnel and routing. The Node protocol's address check is defense-in-depth, not a substitute for the firewall or tunnel.

## Private configuration

Save one JSON config to `/srv/palatiny-pilot/host-config.json` on each host and `chmod 600` it. Use distinct persistent identities, a matching `pilotId` and `area`, and real independently verified Peer IDs.

Observer host example (substitute actual keys and overlay addresses):

```json
{
  "schema": "palantiny.p02c-host-pilot.v1",
  "syntheticOnly": true,
  "pilotId": "private-host-trial-01",
  "role": "observer",
  "area": "synthetic-field-trial",
  "stateDir": "/srv/palatiny-pilot",
  "listen": "/ip4/10.77.10.1/tcp/40123",
  "allowPrivateLan": true,
  "remoteIp": "10.77.10.2",
  "remotePeerId": "REPLACE_WITH_VERIFIED_PUBLISHER_PEER_ID",
  "remoteSeed": "/ip4/10.77.10.2/tcp/40124/p2p/REPLACE_WITH_VERIFIED_PUBLISHER_PEER_ID"
}
```

Publisher config uses `role:"publisher"`, `listen:"/ip4/10.77.10.2/tcp/40124"`, `remoteIp:"10.77.10.1"`, and the observer's verified Peer ID and seed `/ip4/10.77.10.1/tcp/40123/p2p/<verified-observer-id>`. The placeholder config must *not* pass validation: that's intentional.

## Mandatory approved remote peer (H0 hardening)

The operator-run pilot now refuses to start or pass preflight unless the current remote Peer ID, private source IP and exact seed address are **approved in the local P03 private ledger**. Each host must perform its own enrollment; enrollment is **not** automatically exchanged between hosts and merely setting a Peer ID in `host-config.json` is insufficient.

After creating and independently verifying the private configuration on each host, run:

```sh
npm run peer:enrollment -- init /srv/palatiny-pilot/host-config.json
npm run peer:enrollment -- propose /srv/palatiny-pilot/host-config.json VERIFIED_REMOTE_PEER_ID VERIFIED_REMOTE_OVERLAY_IP VERIFIED_REMOTE_SEED
# Only after independently checking the Peer ID and overlay IP:
npm run peer:enrollment -- approve /srv/palatiny-pilot/host-config.json VERIFIED_REMOTE_PEER_ID --verified-out-of-band
npm run peer:enrollment -- pins /srv/palatiny-pilot/host-config.json
npm run pilot:preflight -- /srv/palatiny-pilot/host-config.json
```

The ledger is a 0600 file under the operator's 0700 state directory. Revoking an approved peer (`npm run peer:enrollment -- revoke ...`) now triggers process-local shutdown if the standalone pilot is running; the process also stops on ledger revision/configuration drift and requires manual review/restart. A startup check is still vulnerable to a short filesystem/polling race, not a cryptographic distributed revocation guarantee. During a real incident, close the tunnel firewall TCP port immediately.

See [P03_PRIVATE_ENROLLMENT.md](P03_PRIVATE_ENROLLMENT.md) and [HARDENING_AUDIT_2026_11_07.md](HARDENING_AUDIT_2026_11_07.md).

## Run and capture

On each machine run `npm run pilot:preflight -- /srv/palatiny-pilot/host-config.json`. This only checks the local configuration and persistent identity.

Start the observer first and capture the local stdout record separately:

```sh
npm run pilot:observe -- /srv/palatiny-pilot/host-config.json > observer.ndjson
```

Then the publisher sends an explicitly numbered **fictional** fixture:

```sh
npm run pilot:publish -- /srv/palatiny-pilot/host-config.json 1 > publisher.ndjson
```

The observer exits successfully only after it verifies and sees a synthetic report in its GossipSub subscription. The publisher emits `synthetic-published-no-ack`: it cannot claim end-to-end delivery itself. Both operators exchange only appropriately redacted *public* evidence logs, not private configs or any private key files.

Use the offline reviewer with the two actual event logs:

```sh
npm run pilot:review -- observer.ndjson publisher.ndjson
```

**Important:** `npm run` may prepend command banners to stdout. For machine-readable NDJSON use `node apps/p02c-host-pilot.mjs observe ... > observer.ndjson` and `node apps/p02c-host-pilot.mjs publish ... 1 > publisher.ndjson` directly. The reviewer requires one JSON record per line and at least one matching publisher/observer report ID. It deliberately returns `remoteHostsVerified:false`, because unsigned process logs cannot prove physical independence.

## Required manual outage, restart and rejection drills

Perform these actions with synthetic-only fixtures and record commands, timestamps, host provenance and results in a privately maintained evidence report.

1. **Baseline:** both hosts subscribe/publish; the observer independently logs a matching signed report ID and receiver count. Record host OS, network interface, overlay routing, distinct public Peer IDs and fixed private addresses, without physical locations or private keys.
2. **Network outage:** stop the observer or block the chosen TCP port in the private overlay firewall, then run publisher round 2. The publisher must exit nonzero; the observer cannot claim a received report. Preserve redacted error and firewall state evidence.
3. **Recovery:** restore the firewall and relaunch the observer, then run publisher round 3. It must produce a *new* matching observer receipt.
4. **Identity persistence:** restart both processes against their original private state directories. Confirm both Peer IDs stay unchanged. Never silently rotate a missing key.
5. **Negative trust:** try a deliberately wrong remote Peer ID in a copy of the private config, then a wrong approved IP. Both must fail to establish an authorized connection. Reject public/wildcard listener, malformed config and unsynthetic area.
6. **Evidence:** use the offline reviewer separately for each successful round; record negative outcomes and independent operator attestations outside the code repository. Do not publish private addresses without operator consent.

CI exercises two independently configured **localhost processes**, a matching synthetic report across process boundaries, stable Peer IDs over restart and a failed publisher when the observer is offline. CI cannot substantiate two separately administered physical machines or private-WireGuard firewall behavior.

## Remaining P02/P03 release blockers

- Actual two-host independent execution and authenticated overlay/firewall evidence
- Host-level latency, reconnect/partition, connection-exhaustion and resource observation
- Reproducible supply-chain artifacts, emergency shutdown and incident ownership
- Broader bootstrap/NAT policy and independently governed participant enrollment/revocation
- Privacy/scientific validation, independent sensor attestations and consent for real-data work

Do not update the P00 evidence ledger to 'verified' merely because tests or the offline reviewer pass. It is not a public network admission authority. P02c-2 supplies a runbook and tools to **collect future evidence**, not the evidence itself.
