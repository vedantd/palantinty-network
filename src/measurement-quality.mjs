/**
 * Local measurement-quality classification from numeric-only pipeline counters.
 * Never publish this snapshot as a per-sensor regional report.
 *
 * Counts refer to completed/rejected *observed* windows, not all wall-clock
 * intervals. A silent sensor can produce zero windows and still appear healthy
 * unless an independent uptime signal is supplied.
 */
export function summarizeLocalMeasurementQuality(diagnostics) {
 if(!diagnostics || typeof diagnostics!=='object')
  throw new TypeError('Diagnostics required');
 const fields=['released','incompleteWindows','overflowDropped',
  'retiredWindowsDropped','policyRejected','revokedPending',
  'acceptedEvents','rejectedEvents','pending','connections','disconnections'];
 for(const name of fields) {
  const value=diagnostics[name];
  if(!Number.isSafeInteger(value)||value<0)
   throw new TypeError('Invalid diagnostics counter: '+name);
 }
 if(typeof diagnostics.connected!=='boolean')
  throw new TypeError('Invalid connected state');
 const observedWindows=diagnostics.released+diagnostics.incompleteWindows+
  diagnostics.overflowDropped+diagnostics.retiredWindowsDropped+
  diagnostics.policyRejected+diagnostics.revokedPending+diagnostics.pending;
 const lostWindows=diagnostics.incompleteWindows+diagnostics.overflowDropped+
  diagnostics.retiredWindowsDropped;
 const processedEvents=diagnostics.acceptedEvents+diagnostics.rejectedEvents;
 const eventAcceptancePct=processedEvents?
  Math.round(diagnostics.acceptedEvents/processedEvents*100):null;
 const lossPct=observedWindows?Math.round(lostWindows/observedWindows*100):null;
 const status=observedWindows===0?'insufficient_evidence':
  lostWindows>0?'degraded':diagnostics.pending>0?'pending':'no_known_window_loss';
 return Object.freeze({
  schema:'pulsemesh.local_measurement_quality.v1',
  scope:'local_diagnostics_only',
  status,
  observedWindows,
  lostWindows,
  pendingWindows:diagnostics.pending,
  eventAcceptancePct,
  observedWindowLossPct:lossPct,
  sensorConnected:diagnostics.connected,
  // No inference about periods when a sensor is silent or disconnected.
  uptimePct:null,
  wallClockCoveragePct:null,
  meaning:'observed_window_accounting_not_sensor_uptime'
 });
}
