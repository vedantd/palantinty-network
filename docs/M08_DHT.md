# M08b — sandbox Kademlia peer routing

This slice introduces optional libp2p Kademlia DHT discovery **only on localhost**. `createGossipNode({enableDht:true})` starts a `/palantiny-network/kad/1.0.0` DHT service alongside encrypted TCP/Noise/Yamux/GossipSub. Nodes with `enableDht:false` (the default) retain the existing demo footprint.

The 3-peer integration harness `npm run network:dht` connects A ↔ B and B ↔ C. A is configured with **only B as a seed**, not C. A uses `peerRouting.findPeer(C.peerId)` through the DHT to resolve C and then delivers a strictly signed, synthetic report to C's independent regional indexer.

**ADR-M08b:** Peer discovery and participant authorization are different things. Kademlia helps locate peers, but neither Peer ID nor DHT routing establishes sensor ownership, physical location, independent operators, or truth of observations. The DHT is not an authoritative collector. This sandbox uses loopback and an isolated custom protocol prefix to avoid joining public libp2p networks. It does NOT provide public bootstrap services, remote reachability, NAT traversal, rate-limited admission or real Palantiny publishing.

**Security:** DHT server mode is enabled only when deliberately opted into the local-only sandbox. This is not suitable for unrestricted Internet peers; review resource exhaustion, eclipse, Sybil and metadata-linkability risks before permitting non-loopback interfaces. Stored/counted observations are synthetic. No public network advertisement.

**Validation:** `npm test` asserts the DHT service is opt-in, server mode is local, and public binding is prohibited; `npm run network:dht` demonstrates a peer located beyond its single explicitly connected seed and proves signed-report delivery over encrypted GossipSub.

**Next:** a designed public participant trust policy, peer enrollment and safe multi-host test-network architecture. Do not enable public interfaces merely by changing a listen address.
