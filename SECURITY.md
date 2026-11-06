# Privacy and security

This is an experimental, synthetic-data-only prototype. No Bluetooth scanner or
P2P network is currently implemented in this branch.

- Never export raw Bluetooth identifiers, device names, Wi-Fi BSSIDs, Find My
  keys, or individual sightings.
- Opt-in is mandatory; privacy boundary uses an explicit report allowlist.
- Minimum counts and rounding are NOT anonymity guarantees.
- P2P network metadata and coarse locations can reveal contributor information.
- A signature only proves control of a key, not truthfulness of an observation.
- Do not enable public map release until independent privacy and accuracy review.
