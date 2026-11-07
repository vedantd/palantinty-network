# PulseMesh — evidence-gated A → B → C roadmap

**Decision draft · 2026-11-06.** This document supersedes the old short phase list. See [PROJECT_STATUS.md](PROJECT_STATUS.md) for the implementation inventory. All public activity data in the current network/dashboard demonstrations is **synthetic**.

## North-star hypothesis

A consented community of passive sensors can publish coarse, delayed **relative BLE alias activity** changes that are informative at supported places and times, without reporting device identities. The signal must be validated before public location-specific claims. This is **not pedestrian counting, occupancy tracking or surveillance**.

### What the literature does—and does not—establish

1. Schauer, Werner & Marcus (2014), *Estimating Crowd Densities and Pedestrian Flows Using Wi-Fi and Bluetooth*: airport ground truth. Naive Bluetooth address counts correlated at **Pearson r=0.53**; extended approaches achieved **up to 0.75**. This is an older Bluetooth/Wi-Fi study, **not transferable accuracy for our passive BLE alias method**. https://eudl.eu/doi/10.4108/icst.mobiquitous.2014.257870
2. Gong & Abdel-Aty (2022), *Using Machine Learning to Estimate Pedestrian and Bicyclist Count of Intersection by Bluetooth Low Energy*: BLE plus ML and video ground truth; study reported **6.35% average absolute percentage error** under its setup. It uses a distinct model, target and protocol and is **not a PulseMesh performance prediction**. https://doi.org/10.1061/JTEPBS.0000619
3. *Estimating pedestrian traffic with Bluetooth sensor technology* (2023): a 65-detector urban study reports **89% pedestrian-detection accuracy** under calibration/classification assumptions. That number describes **pedestrian classification**, not crowd-count accuracy. https://doi.org/10.1080/10095020.2023.2247446
4. Bluetooth SIG (2025), *Randomized RPA Updates*: address rotation exists to improve privacy and reduce tracking/linkability, a reason to avoid treating discovered aliases as stable persons. https://www.bluetooth.com/blog/enhancing-device-privacy-and-energy-efficiency-with-bluetooth-randomized-rpa-updates/
5. Stanciu et al. (2023), *Privacy-friendly statistical counting for pedestrian dynamics*: cryptographic aggregation research illustrates that statistical counts and strong privacy require more than simple identifier removal/thresholds. https://doi.org/10.1016/j.comcom.2023.09.009

Research should inform **study design, confounders and baselines**, not substitute for PulseMesh field evidence. Do not claim accuracy by copying percentages from studies.

## Phase A — validate the sensing hypothesis (next, gate before real network)

**A0: Freeze experimental methodology (1–2 days).** Identify primary use case: detect **relative busy/quiet changes** at a fixed site. Choose counting boundary, 60-second buckets, sensor mounting, synchronized independent manual passage counts and a second observer for a subset. Document quiet/medium/busy periods, Bluetooth/radio status, fixed-device background, weather and obstruction as nonidentifying annotations. Minimize personal data; get site permission.

**A1: instrumentation and safe persistence (2–4 days).** Bound `ScanSession.closedWindows`; independently measure scanner-connected/radio-ready time and observed window completeness. No raw BLE identity logging, and no real-data network uploads. Make calibration runner reject missing timestamps, mismatched windows and accidental identifier fields.

**A2: field trials (approximately 1–2 weeks, hardware/operator-dependent).** Start with 3+ sessions at one location, varied hours and activity. Then repeat with a second location and, if possible, a different scanner/placement. Include stationary IoT background and sensor-off controls. Hold out entire sessions for evaluation—no training/evaluation leakage. Record all failures, not just favorable trials.

**A3: analysis and go/no-go.** Compare (i) simple alias activity, (ii) moving-baseline changes, and (iii) an explicitly named naive time-of-day baseline. Measure Spearman rank correlation, relative change direction accuracy, absolute/relative error *only for separately calibrated prediction targets*, coverage, missingness and confidence intervals by session/site. Check placement sensitivity and long silent intervals.

**Proposed, revisable acceptance gate:** across held-out sessions, a consistent improvement over the time-of-day baseline, useful busy/quiet ordering (e.g. Spearman rho >= 0.6 as a **planning target**, not a literature fact), at least 90% usable expected windows during controlled sessions, and no serious unmitigated privacy risks. Report sample size, variability and failures. If not met, narrow the use case, supplement with environmental sensors, or stop.

**Deliverable:** reproducible anonymized analysis, limitations report and a decision memo. Do not announce a measured footfall product before this exists.

## Phase B — real multi-node prototype (conditional on A)

**B0 (trust design):** manual trusted onboarding for 2–3 volunteer nodes and a coarse site attestation procedure, threat modeling for Sybil/signing-key duplication, address spoofing and location fraud. Explicit retention and operator consent review.

**B1 (closed pilot):** signed opt-in real aggregate reports using current privacy gate/outbox over authenticated, encrypted links to one durable indexer. First with test fixtures, then *only after an explicit privacy go/no-go* a narrow permissioned field trial. Safe redaction, opt-out/delete and recovery paths.

**B2 (quality gates):** minimum independent operators, verified radio/scan coverage, multi-node agreement, minimum delay and thresholds, sparse-data suppression. No publication of individual contributor health histories. Instrument missing reports, clock skew, replay, restart and durability.

**B3 (fault/adversarial exercise):** disconnection, replay, duplicate identities, fabricated measurements, failed disk, key revocation, slow peers and metadata/linkability review.

**Gate to C:** independent sensing and site evidence, enforceable quality/privacy release gates, demonstrable 2–3 node successful operation and explicit limitations.

## Phase C — public-facing experience (conditional on B)

**C0 (now):** publish a self-contained **synthetic** animated showcase, clearly marked as concept work. This is appropriate for outreach and early feedback **today**.

**C1:** production-like site explorer with *verified coverage* and calibration uncertainties. No individual-device paths or real-time safety/occupancy claims.

**C2:** deploy a limited opt-in pilot map with suppression of unsafe cells, data provenance, source independence, delays and explanations for missing values.

**C3:** use cases with measured value, e.g. directional activity changes for urban research, venue operations, or transit corridors. Validate a concrete user need, not just visualization novelty.

**Incentives/tokenomics remain out of scope** until useful signal, privacy and an attack-resistant network are demonstrated.

## Current engineering position and immediate choices

Already built: macOS sensing integration, local aggregation/consent gate, signed SQLite outbox, private synthetic libp2p demonstrations, durable regional SQLite, synthetic dashboard, aggregate availability and numeric local loss indicators, fault-injection tests. **Not done:** real live mesh, calibrated measures, sensor uptime, public trust/geo verification, retention at scale or a public map.

**Proposed immediate next work:** A0 experimental design and A1 timing/memory hardening, **not** more distributed infrastructure. Separate product positioning from capabilities: `Relative BLE activity index (experimental)` until ground truth supports something stronger.

## Demo release checklist (for tweeting)

- Must prominently say **SYNTHETIC DEMO — NO LIVE SENSORS** in every frame.
- Show fictional geography; no actual coordinates and no implied deployment scale.
- Show privacy boundary: aggregate-only reports, opt-in, coarse zone and delayed publication.
- Emphasize missing coverage and quality flags (not zero or occupancy).
- Provide repository/source link and a short limitations note.
- Video/screenshot should be viewable without internet; do not upload raw sensor logs.
- Use language “research prototype” and “what if a community could observe changes in places without tracking people?” rather than “real-time crowdsourced people counter”.
