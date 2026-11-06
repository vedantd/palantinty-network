/**
 * Explicitly allowlisted LOCAL measurement artifact.
 * File is optional and must never contain broadcast/device identifiers.
 * Not authorized for network publishing.
 */
function nonnegative(n, name) {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`Invalid summary field: ${name}`);
  return n;
}
export function makeLocalScanArtifact(summary) {
  if (!summary || !Array.isArray(summary.closedWindows) ||
      summary.network !== false || summary.simulation !== false)
    throw new Error('Invalid local scan summary');
  if (summary.closedWindows.length > 10000) throw new Error('Too many scan windows');
  const allowedGates = new Set(['not_ready','ready','below_threshold','opt_in_required','invalid_window']);
  const windows=summary.closedWindows.map(w=>{
    if (!allowedGates.has(w.defaultGate)) throw new Error('Invalid release gate');
    return {
      bucketStart:nonnegative(w.bucketStart,'bucketStart'),
      bucketSeconds:nonnegative(w.bucketSeconds,'bucketSeconds'),
      observedAliases:nonnegative(w.observedAliases,'observedAliases'),
      activityIndex:w.activityIndex===null ? null : nonnegative(w.activityIndex,'activityIndex'),
      defaultGate:w.defaultGate
    };
  });
  return {
    schema:'pulsemesh.scan.local.v1',
    simulation:false,
    network:false,
    hardware:'palantiny-macos-corebluetooth',
    complete:summary.complete === true,
    radio:['on','off','unknown','denied','unsupported','starting'].includes(summary.radio)
      ? summary.radio : 'unknown',
    scanSeconds:nonnegative(summary.scanSeconds,'scanSeconds'),
    windowSeconds:nonnegative(summary.windowSeconds,'windowSeconds'),
    advertisementsAccepted:nonnegative(summary.advertisementsAccepted,'advertisementsAccepted'),
    rejected:nonnegative(summary.rejected,'rejected'),
    sessionUniqueAliases:nonnegative(summary.sessionUniqueAliases,'sessionUniqueAliases'),
    aliasCountCapped:summary.aliasCountCapped===true,
    droppedLines:nonnegative(summary.droppedLines,'droppedLines'),
    droppedClosedWindows:nonnegative(summary.droppedClosedWindows,'droppedClosedWindows'),
    closedWindows:windows
  };
}
