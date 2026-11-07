# P02c-1 — opt-in pinned synthetic GossipSub over a private overlay

**Status:** controlled RFC1918-only transport slice. **NOT** a public Internet testnet, a deployed multi-physical-host pilot, or real BLE participation.

## Design

The existing pinned synthetic GossipSub node remains **loopback-only by default**. To bind a private-LAN interface, an operator must deliberately supply all of:
- `allowPrivateLan:true`
- one concrete private interface listener (`10/8`, `172.16/12` or `192.168/16`), never wildcard `0.0.0.0` or a public IP
- a short exact allowlist of remote RFC1918 IP addresses, plus independently verified libp2p Noise Peer IDs
- an explicit seed containing the remote address **and** its pinned `/p2p/<PeerID>` identity

The listener, outbound dial address, inbound source address, and authenticated remote identity must all be permitted. No DNS, relay, public DHT, auto-enrollment, global discovery, remote real-data source or Internet-facing connection is enabled. A source IP can change during NAT or overlay routing; the exact-IP policy intentionally fails closed in that case. Independently verify IDs out of band; a manifest by itself proves nothing.

Example operator options (use your *own* private interface, not these placeholder addresses):

```js
const node=await createPinnedSyntheticGossipNode({
  privateKey:operatorIdentity.privateKey,
  listen:'/ip4/10.77.10.1/tcp/40123',
  allowPrivateLan:true,
  allowedRemoteIps:['10.77.10.2'],
  allowedPeerIds:[verifiedRemotePeerId]
});
```

This is an API building block, **not** a self-service enrollment CLI. The P01b existing independent-indexer runbook remains a separate private archive-sync protocol. Synthetic GossipSub transport has no durable ACK or guaranteed delivery.

## Automated evidence: independent network namespaces, same Docker host

```sh
node --test tests/p02c-private-overlay.test.mjs
docker compose -f deploy/compose.p02c.yml down --volumes --remove-orphans
docker compose -f deploy/compose.p02c.yml up --build --abort-on-container-exit --exit-code-from observer
docker compose -f deploy/compose.p02c.yml down --volumes --remove-orphans
```

Two test-only containers have separate network interfaces and independent ephemeral private keys. They exchange only public test Peer IDs via an ephemeral coordination volume, build mutually pinned Noise connections over a non-host-exposed, internal Docker bridge, then verify a signed synthetic report arrived through the sanitized observer. **This test-only coordination volume is not a secure identity enrollment mechanism.** The throwaway CI containers run with root-owned ephemeral volumes; this is not recommended as a production deployment pattern. No host ports are published. Do not transport real BLE measurements through this test.

## Independently administered host acceptance drill (still pending)

On two separately operated machines under an authenticated private overlay such as WireGuard:
1. Provision permanent identities independently with the existing operator-identity tooling; never exchange keys or use shared folders.
2. Independently verify and pin the remote Peer ID and the remote private overlay address. Allow just the intended TCP port at the OS firewall. Confirm traffic stays on the private interface.
3. Start one pinned synthetic GossipSub node per host. Both must subscribe to the same coarse **synthetic-only** topic. Publish fictional signed report fixtures, inspect only the sanitized observer output and record run time, distinct Peer IDs, endpoints, counters and delivery results.
4. Deliberately block the overlay port: verify the node no longer receives reports. Restore connectivity and verify new synthetic reports arrive. GossipSub does not promise to replay missed reports.
5. Try a wrong Peer ID, an unapproved RFC1918 source IP and a public/wildcard listener; all must fail closed. Repeat after restart using the same operator private identities.
6. Run the real operator incident playbook once one exists, including shutdown, key revocation, backups and a safe rollback.

**Do not claim two independently administered physical hosts have passed until that test is executed and evidence reviewed.** Private overlays do not equal publicly reachable nodes or general NAT traversal.

## ADR P02c-1 and next steps

Preserve the safe localhost default while introducing opt-in, explicitly pinned RFC1918 transport. Address restrictions apply before identity authentication and must not be mistaken for proof of human or sensor origin. A hostile host on an authorized private IP can still consume resources before Noise authentication; bounded P02b controls are not a production DoS solution.

Next: repeat the drill on two actual hosts, measure abusive connection/load behavior and recovery, add a testnet-only emergency disable procedure; later work on bootstrap/NAT and P03 participant enrollment. **All release-readiness gates remain blocked**.
