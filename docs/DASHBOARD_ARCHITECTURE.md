# Dashboard module boundaries

The synthetic dashboard is now composed from separate concerns:

- `dashboard-regions.mjs`: schematic, explicitly non-georeferenced region definitions.
- `dashboard-fixture.mjs`: **demo-only** signing and synthetic report seeding.
- `dashboard-model.mjs`: read-only overview/history projections over an injected `query({area,start,end,limit})` function. No keys, SQLite, filesystem or network dependencies.
- `dashboard.mjs`: temporary SQLite/identity lifecycle and composition root.
- `dashboard-server.mjs`: existing HTTP/static asset adapter.

The model still marks responses as `simulation:true` and
`experimental_synthetic_only` semantics apply to the underlying indexer.
Do **not** reuse this model unchanged to label real sensor data as synthetic
or to make people-count claims. A production read model needs explicit data
provenance, coverage and quality gates first.

Run `npm test` for independent model tests and the original end-to-end
signed synthetic indexer/dashboard tests. No new production API is introduced.
