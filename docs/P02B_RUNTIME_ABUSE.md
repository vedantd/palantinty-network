# P02b-3 — localhost adversarial transport drill

**Scope:** ephemeral-key, synthetic-only local integration tests of the actual libp2p TCP/Noise/Yamux stack. These tests create no Internet listener and never publish real Bluetooth measurements.

## Cases and acceptance

1. Three independently generated, **unlisted** Noise identities dial a pinned node concurrently. No unlisted connection may remain established after the remote upgrade-gater rejection; an initiating dial can transiently report success before the disconnect is observed. A pinned peer must connect afterward.
2. Six plain TCP clients leave upgrade handshakes idle. None may become an authenticated libp2p peer. After closing attack sockets, a legitimate pinned peer must connect.
3. A test-only protocol handler on a pinned node accepts at most two simultaneous inbound streams. Attempts to open more must not increase active handler executions. After cleanup, another stream must be accepted.

All network activity is bound to `127.0.0.1`; tests run under explicit timeout and close resources in `finally`.

```sh
node --test tests/p02b3-runtime-abuse.test.mjs
npm test
```

## ADR-P02b-3 / limitations

- Test actual transport/network behavior as well as policy-unit tests; mere configuration values are not proof of enforced limits.
- Test-only stream protocol is never registered by the production node factory. The network remains synthetic-only and permissioned.
- Tests of six idle TCP sockets are a **small bounded local perturbation**, not packet-rate/load testing, Internet DDoS protection, or proof of absence of CPU/memory exhaustion.
- In the observed local test, some unauthorized dial promises resolved before the transport rejected/closed the connection. **Successful dial resolution is not proof of admitted membership**; tests require unauthorized connections to disappear on both sides. A temporary upgraded connection is still an important residual risk until tighter admission is independently validated. Untrusted TCP connections consume resources before Noise reveals identity.
- GossipSub observer budget is after libp2p packet processing; upstream bandwidth/CPU protections, pressure instrumentation, revocation, cross-host tests, NAT, safe shutdown, bootstrap diversity, and recovery after real network partitions still need separate evidence.
- Keep `network-abuse-controls` and `untrusted-peer-fault-tests` release gates **blocked** until independently verified Internet-facing operational testing and review. Do not open public interfaces or solicit sensor reports.

This is another incremental pre-public test slice, **not evidence that arbitrary Internet participants can join**.
