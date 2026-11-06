#!/usr/bin/env node
import { startPalantinyBridge } from '../src/palantiny-bridge.mjs';
import { LocalActivityPipeline } from '../src/activity-pipeline.mjs';

const args = Object.fromEntries(process.argv.slice(2).filter(x => x.startsWith('--') && x.includes('='))
  .map(x => { const at = x.indexOf('='); return [x.slice(2, at), x.slice(at + 1)]; }));
if (!args.listen || !args.palantiny || !args.area) {
  console.error('Usage: node apps/palantiny-bridge.mjs --listen=/tmp/pulsemesh-sensor.sock --palantiny=/absolute/palantiny/data/sensor.sock --area=demo-coarse-cell');
  process.exit(2);
}
// No network transport is implemented. This adapter is off by default and
// does not print or publish individual BLE IDs.
const pipeline = new LocalActivityPipeline({ policy: { consent: false, area: args.area } });
const bridge = await startPalantinyBridge({
  listenPath: args.listen, palantinySocket: args.palantiny,
  onEvent: event => pipeline.accept(event),
  onSensorConnected: () => pipeline.sensorConnected(),
  onSensorDisconnected: () => pipeline.sensorDisconnected()
});
const timer = setInterval(() => pipeline.tick(), 5000);
console.log('PulseMesh local-only bridge:', bridge.path);
console.log('Network publishing: DISABLED');
async function stop() {
  clearInterval(timer);
  await bridge.close();
  process.exit(0);
}
process.once('SIGINT', () => { void stop(); });
process.once('SIGTERM', () => { void stop(); });
