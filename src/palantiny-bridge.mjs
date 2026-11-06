import net from 'node:net';
import { existsSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { JsonLineDecoder } from './jsonl.mjs';
import { parseSensorEvent } from './sensor-event.mjs';

/**
 * Local sensor relay: Palantiny scanner -> PulseMesh Unix socket -> Palantiny server.
 * Bytes are forwarded unchanged; a separate local-only parser derives aggregates.
 * No network publishing, and no remotely accessible API.
 */
export async function startPalantinyBridge({ listenPath, palantinySocket, onEvent = () => {},
  onSensorConnected = () => {}, onSensorDisconnected = () => {}, onDropped = () => {} }) {
  if (typeof listenPath !== 'string' || typeof palantinySocket !== 'string') throw new TypeError('socket paths required');
  const listener = resolve(listenPath);
  const upstreamPath = resolve(palantinySocket);
  if (listener === upstreamPath) throw new Error('listen and upstream sockets must differ');
  // Never unlink an existing socket from another process.
  if (existsSync(listener)) throw new Error('listen socket already exists; refusing to replace it');
  if (!existsSync(upstreamPath)) throw new Error('Palantiny socket not found');
  const active = new Set();
  let stopped = false;
  const server = net.createServer(sensor => {
    sensor.pause();
    const upstream = net.createConnection({ path: upstreamPath });
    active.add(sensor);
    let connected = false, disconnected = false;
    const close = () => { sensor.destroy(); upstream.destroy(); };
    const decoder = new JsonLineDecoder({
      onDropped,
      onLine(line) {
        const event = parseSensorEvent(line);
        if (!event) { onDropped('invalid_or_ignored'); return; }
        try { onEvent(event); } catch { onDropped('processor_failure'); }
      }
    });
    const disconnect = () => {
      if (disconnected) return;
      disconnected = true;
      active.delete(sensor);
      decoder.close();
      if (connected) {
        try { onSensorDisconnected(); } catch { onDropped('disconnect_callback_failure'); }
      }
    };
    upstream.once('connect', () => {
      connected = true;
      try { onSensorConnected(); } catch { onDropped('connect_callback_failure'); }
      sensor.on('data', bytes => decoder.push(bytes));
      // Backpressure from Palantiny is respected by Node's pipe.
      sensor.pipe(upstream);
      sensor.resume();
    });
    upstream.on('error', close);
    upstream.on('close', close);
    sensor.on('error', close);
    sensor.on('close', () => { disconnect(); close(); });
  });
  try {
    await new Promise((yes, no) => {
      server.once('error', no);
      server.listen(listener, () => { server.removeListener('error', no); yes(); });
    });
    chmodSync(listener, 0o600);
  } catch (err) { server.close(); throw err; }
  return {
    path: listener,
    async close() {
      if (stopped) return;
      stopped = true;
      for (const socket of active) socket.destroy();
      await new Promise(done => server.close(done));
    }
  };
}
