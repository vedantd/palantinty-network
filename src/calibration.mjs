/**
 * M02 local-only BLE-versus-manual activity calibration.
 *
 * Never joins device identities, tracks people, or sends inputs to a network.
 * The two metrics have different units: correlation assesses co-movement,
 * NOT absolute accuracy, attendance, occupancy, or a people count.
 */
const MAX_RECORDS = 10_000;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const isNonnegativeInteger = n => Number.isSafeInteger(n) && n >= 0;
const round = (n, digits = 3) => Number(n.toFixed(digits));

export function parseManualCountsCsv(csv) {
  if (typeof csv !== 'string' || csv.length > 1_000_000)
    throw new Error('Manual CSV must be a string of at most 1MB');
  const lines = csv.replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  if (lines.shift() !== 'bucketStart,manualCount')
    throw new Error('Expected CSV header: bucketStart,manualCount');
  if (lines.length > MAX_RECORDS) throw new Error('Too many manual count rows');
  const rows = [];
  const seen = new Set();
  for (const [index, line] of lines.entries()) {
    const columns = line.split(',');
    if (columns.length !== 2 || !UTC_TIMESTAMP.test(columns[0]) ||
        !/^\d+$/.test(columns[1]))
      throw new Error(`Invalid manual CSV row ${index + 2}`);
    const timestamp = Date.parse(columns[0]);
    const manualCount = Number(columns[1]);
    if (!Number.isSafeInteger(timestamp) || !isNonnegativeInteger(manualCount) ||
        manualCount > 1_000_000 || new Date(timestamp).toISOString() !==
          new Date(columns[0]).toISOString())
      throw new Error(`Invalid manual CSV value at row ${index + 2}`);
    if (seen.has(timestamp)) throw new Error(`Duplicate manual bucket at row ${index + 2}`);
    seen.add(timestamp);
    rows.push({ bucketStart: timestamp, manualCount });
  }
  return rows;
}

export function pearsonCorrelation(xs, ys) {
  if (xs.length !== ys.length || xs.length < 3) return null;
  const mx = xs.reduce((a,b)=>a+b,0) / xs.length;
  const my = ys.reduce((a,b)=>a+b,0) / ys.length;
  let xy=0, xx=0, yy=0;
  for(let i=0;i<xs.length;i++) {
    const dx=xs[i]-mx, dy=ys[i]-my;
    xy+=dx*dy; xx+=dx*dx; yy+=dy*dy;
  }
  return xx===0 || yy===0 ? null : round(Math.max(-1,Math.min(1,xy / Math.sqrt(xx*yy))));
}

function averageRanks(values) {
  const entries=values.map((value,index)=>({value,index})).sort((a,b)=>a.value-b.value);
  const ranks=new Array(values.length);
  for(let i=0;i<entries.length;) {
    let j=i+1;
    while(j<entries.length && entries[j].value===entries[i].value) j++;
    const rank=(i+1+j)/2;
    for(let k=i;k<j;k++) ranks[entries[k].index]=rank;
    i=j;
  }
  return ranks;
}

export function spearmanCorrelation(xs,ys) {
  return xs.length!==ys.length || xs.length<3
    ? null : pearsonCorrelation(averageRanks(xs), averageRanks(ys));
}

/**
 * scan: allowlisted local diagnostic artifact from npm run scan -- --summary-file
 * manual: per-window pedestrian passage counts collected independently.
 * No precise sensor location, person/device identifier, or raw sighting.
 */
export function evaluateCalibration(scan, manual, { minimumPairs = 12, allowSynthetic = false } = {}) {
  if (!Number.isSafeInteger(minimumPairs) || minimumPairs < 3 || minimumPairs > 1000)
    throw new Error('minimumPairs must be 3..1000');
  if (!scan || scan.schema !== 'pulsemesh.scan.local.v1' ||
      scan.network !== false || scan.complete !== true ||
      (!allowSynthetic && scan.simulation !== false))
    throw new Error('Expected completed local-only non-synthetic PulseMesh scan summary');
  if (!Number.isSafeInteger(scan.windowSeconds) || scan.windowSeconds < 10 ||
      !Array.isArray(scan.closedWindows) || scan.closedWindows.length > MAX_RECORDS)
    throw new Error('Invalid scan window metadata');
  if (!Array.isArray(manual) || manual.length > MAX_RECORDS)
    throw new Error('Invalid manual count rows');
  const manualByBucket=new Map();
  for(const row of manual) {
    if (!isNonnegativeInteger(row.bucketStart) || !isNonnegativeInteger(row.manualCount) ||
        row.manualCount > 1_000_000 || manualByBucket.has(row.bucketStart))
      throw new Error('Invalid or duplicate manual count row');
    manualByBucket.set(row.bucketStart,row.manualCount);
  }

  const seen=new Set(), pairs=[];
  const bucketMs=scan.windowSeconds*1000;
  for(const w of scan.closedWindows) {
    if (!isNonnegativeInteger(w.bucketStart) ||
        w.bucketStart % bucketMs !== 0 ||
        w.bucketSeconds !== scan.windowSeconds ||
        !isNonnegativeInteger(w.observedAliases) || w.observedAliases > 1_000_000 ||
        seen.has(w.bucketStart))
      throw new Error('Invalid or duplicate scan bucket');
    seen.add(w.bucketStart);
    if(manualByBucket.has(w.bucketStart))
      pairs.push({bucketStart:w.bucketStart,bleAliases:w.observedAliases,
        manualCount:manualByBucket.get(w.bucketStart)});
  }
  pairs.sort((a,b)=>a.bucketStart-b.bucketStart);
  const xs=pairs.map(p=>p.bleAliases), ys=pairs.map(p=>p.manualCount);
  const spearman=spearmanCorrelation(xs,ys), pearson=pearsonCorrelation(xs,ys);
  const flags=[];
  if(pairs.length < minimumPairs) flags.push('insufficient_matched_windows');
  if(spearman===null) flags.push('constant_or_insufficient_variation');
  if(scan.radio!=='on') flags.push('bluetooth_status_unconfirmed');
  if(scan.droppedClosedWindows > 0) flags.push('dropped_scan_windows');
  if(scan.droppedLines > 0) flags.push('dropped_sensor_lines');
  if(scan.aliasCountCapped === true) flags.push('alias_count_capped');
  if(scan.rejected > 0) flags.push('rejected_sensor_observations');
  if(pairs.length !== scan.closedWindows.length) flags.push('unmatched_scan_windows');

  return {
    schema:'pulsemesh.calibration.local.v1',
    network:false,
    source:'local_aggregate_versus_manual_passage_counts',
    status: pairs.length >= minimumPairs && spearman!==null
      ? 'exploratory_statistics_available' : 'insufficient_evidence',
    matchedWindows:pairs.length,
    scanWindows:scan.closedWindows.length,
    manualWindows:manualByBucket.size,
    matchedFraction:scan.closedWindows.length
      ? round(pairs.length/scan.closedWindows.length) : 0,
    windowSeconds:scan.windowSeconds,
    correlation: {spearman,pearson},
    qualityFlags:flags,
    interpretation:'Exploratory co-movement of BLE aliases and independently counted passages. Not a people count, occupancy measure, or validated prediction.',
    recommendation:'Collect repeated same-site sessions across different activity conditions before making accuracy claims.'
  };
}
