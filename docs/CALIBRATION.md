# M02 — Pilot measurement and ground-truth calibration

**Goal:** establish whether on-device BLE alias activity correlates with
independently observed *pedestrian passages*, across multiple conditions.
This is not a people-count product or safety/occupancy system.

## Pilot preparation

Obtain permission for the sensing location and conduct sampling in an
appropriately public setting. Never store names, individual descriptions,
Bluetooth identifiers, exact trajectories, raw scanner logs, or photos of
people in the calibration dataset.

Start with **one fixed sensor and one manual observer**. Prefer a stable
position with an unobstructed view of an agreed counting boundary. Count
**passages across that boundary**, not unique individuals; define whether a
person crossing in the opposite direction counts too and apply consistently.

A 2-minute trial produces only about five complete 20-second windows.
That is enough for functional hardware verification, **not enough to
establish a meaningful activity-to-footfall relationship**. For calibration,
prefer 60-second windows for a 20–30 minute session, and then repeat at
different activity levels, days and locations. Record nonidentifying
experiment notes privately (e.g. indoor/outdoor, sensor height and weather)
separately from the machine-readable dataset. Choose and keep the counting
method fixed per experiment.

## Collect the BLE summary

With Node 22+ and Palantiny's native sensor already built:

```bash
cd ~/dev/pulsemesh
mkdir -p calibration-data
npm run scan -- --seconds=1500 --window-seconds=60 \
  --summary-file=calibration-data/pilot-01.json
```

The CLI creates the output *only if the scan completes*; it never overwrites
an existing file. It writes mode 0600 and stores **aggregate-only** fields.
It does not persist Bluetooth IDs, names, radio payloads or trajectories.
The log remains on your device: **do not publish calibration artifacts
without examining privacy, consent and sparse-cell implications.**

## Record manual counts

Run the scan and manual counting **at the same time**. When it completes:

```bash
npm run calibrate -- --scan=calibration-data/pilot-01.json --template=csv \
  > calibration-data/pilot-01-manual.csv
```

This produces a CSV with a list of exact UTC bucket boundaries:

```csv
bucketStart,manualCount
2026-11-06T16:01:00.000Z,
2026-11-06T16:02:00.000Z,
```

The timestamps above are **illustrative**. Fill in the observed passage
count for each matching interval *during the experiment*, using a synchronized
clock or an observer timing sheet. Do not attempt to reconstruct or guess
manual counts after the event. The `bucketStart` names the **beginning**
of the window and the count covers that window's complete duration.

To evaluate:

```bash
npm run calibrate -- --scan=calibration-data/pilot-01.json \
  --manual=calibration-data/pilot-01-manual.csv
```

The command prints an aggregate-only JSON assessment. A status of
`insufficient_evidence` exits with code 2 intentionally. The default
minimum is 12 exactly matched nonconstant windows; satisfying it is only a
floor for descriptive analysis, not proof of predictive validity.

## How to interpret the report

- **Spearman correlation**: co-movement of ranks, useful for testing
  whether busy times tend to produce higher BLE alias counts.
- **Pearson correlation**: linear association, which may differ from
  rank correlation due to outliers and nonlinear response.
- **matchedFraction**: fraction of scan windows having a matched manual
  count. Unmatched windows are not silently imputed.
- **qualityFlags**: status of sensor and observation completeness.

A strong correlation in one session does **not** imply accurate individual
people counts, causation, privacy, cross-location comparability or usefulness
during special events. Repeat sessions and include genuinely quiet and busy
periods, then assess out-of-sample stability. Fixed indoor IoT advertisements,
RSSI changes, sensor placement, Bluetooth alias rotation and overlapping
reception areas can bias measurements.

## Security / sharing boundary

This M02 export is **local-only** and separate from the future P2P
publication protocol. Even aggregate timestamp series may reveal behavior
at low-volume locations. Do not automatically transmit these files to the
public mesh or store them in GitHub. Gitignore should exclude
`calibration-data/`; prefer a private data directory.

## Proposed next field milestone

Run at least **three sessions with different expected activity levels**,
each with 12 or more reliably timed aligned windows. Present an exploratory
measurement report with scatterplot, correlation, coverage, and honest
failure cases. Only then consider a customer-facing activity forecast.
