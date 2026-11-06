import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, lstatSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { buildPublishableObservation } from './privacy.mjs';
import { signReport, verifyEnvelope } from './protocol.mjs';

/** Local durable queue. No network code or device-level data storage. */
export class SignedOutbox {
  constructor({ dbPath, identity, now = () => Date.now(), maxPending = 5000 } = {}) {
    if (typeof dbPath !== 'string' || !dbPath.trim()) throw new TypeError('dbPath required');
    if (!identity?.privateKey || !identity?.publicDer) throw new TypeError('Ed25519 identity required');
    if (!Number.isSafeInteger(maxPending) || maxPending < 1) throw new RangeError('maxPending');
    this.now = now; this.identity = identity; this.maxPending = maxPending;
    const dbFile = path.resolve(dbPath);
    const parent = path.dirname(dbFile);
    mkdirSync(parent, { recursive:true, mode:0o700 });
    const stat = lstatSync(parent);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.mode & 0o077)
      throw new Error('Outbox directory must have mode 0700');
    if (existsSync(dbFile)) {
      const fs = lstatSync(dbFile);
      if (!fs.isFile() || fs.isSymbolicLink() || fs.mode & 0o077)
        throw new Error('Outbox database file must have mode 0600');
    }
    this.db = new DatabaseSync(dbFile);
    chmodSync(dbFile,0o600);
    this.db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
    this.db.exec(`CREATE TABLE IF NOT EXISTS config (
      id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL DEFAULT 0,
      next_sequence INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS outgoing (
      report_id TEXT PRIMARY KEY, sequence INTEGER NOT NULL UNIQUE,
      payload TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('queued','acknowledged')),
      created_at INTEGER NOT NULL, next_attempt INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0
    );
    INSERT OR IGNORE INTO config(id,enabled,next_sequence) VALUES(1,0,1);
    CREATE INDEX IF NOT EXISTS outgoing_ready ON outgoing(status,next_attempt,sequence);
    CREATE UNIQUE INDEX IF NOT EXISTS outgoing_unique_window ON outgoing(
      json_extract(payload,'$.body.report.area'),
      json_extract(payload,'$.body.report.bucketStart'),
      json_extract(payload,'$.body.report.bucketSeconds')
    );`);
  }
  get enabled() { return this.db.prepare('SELECT enabled FROM config WHERE id=1').get().enabled === 1; }
  setConsent(enabled) {
    if (typeof enabled !== 'boolean') throw new TypeError('Boolean consent required');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('UPDATE config SET enabled=? WHERE id=1').run(enabled?1:0);
      if(!enabled) this.db.prepare("DELETE FROM outgoing WHERE status='queued'").run();
      this.db.exec('COMMIT');
    } catch(e) {this.db.exec('ROLLBACK');throw e;}
  }
  enqueue(window, policy) {
    if (!this.enabled || policy?.consent !== true) return { ok:false, reason:'opt_in_required' };
    // The zero-delay override is reserved for *local* diagnostics. Outbound
    // queueing always enforces the minimum 15-minute privacy delay.
    const publishPolicy = { ...policy, delayMs: Math.max(15 * 60_000, policy?.delayMs ?? 0) };
    const result = buildPublishableObservation(window, publishPolicy, this.now());
    if (!result.ok) return result;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (!this.enabled) {this.db.exec('ROLLBACK');return {ok:false,reason:'opt_in_required'};}
      const pending=this.db.prepare("SELECT count(*) AS n FROM outgoing WHERE status='queued'").get().n;
      if(pending>=this.maxPending) {this.db.exec('ROLLBACK');return {ok:false,reason:'outbox_full'};}
      // Indexed SQLite lookup avoids an O(queue size) JSON scan.
      const existing=this.db.prepare(`SELECT 1 FROM outgoing WHERE
        json_extract(payload,'$.body.report.area')=? AND
        json_extract(payload,'$.body.report.bucketStart')=? AND
        json_extract(payload,'$.body.report.bucketSeconds')=?`).get(
          result.report.area,result.report.bucketStart,result.report.bucketSeconds);
      if(existing) {
        this.db.exec('ROLLBACK');
        return {ok:false,reason:'duplicate_window'};
      }
      const seq=this.db.prepare('SELECT next_sequence FROM config WHERE id=1').get().next_sequence;
      const env=signReport(result.report,this.identity,seq);
      this.db.prepare(`INSERT INTO outgoing(report_id,sequence,payload,status,created_at,next_attempt,attempts)
        VALUES(?,?,?,'queued',?,?,0)`).run(env.body.reportId,seq,JSON.stringify(env),this.now(),this.now());
      this.db.prepare('UPDATE config SET next_sequence=? WHERE id=1').run(seq+1);
      this.db.exec('COMMIT');
      return {ok:true,reportId:env.body.reportId,sequence:seq};
    } catch(e) {this.db.exec('ROLLBACK');throw e;}
  }
  pending(limit=50) {
    if(!this.enabled) return [];
    if(!Number.isSafeInteger(limit)||limit<1||limit>500) throw new RangeError('limit 1..500');
    const rows=this.db.prepare(`SELECT payload,attempts FROM outgoing
      WHERE status='queued' AND next_attempt<=? ORDER BY sequence LIMIT ?`).all(this.now(),limit);
    return rows.map(row=>{
      const envelope=JSON.parse(row.payload);
      verifyEnvelope(envelope);
      return {envelope,attempts:row.attempts};
    });
  }
  retry(reportId, {baseDelayMs=1000,maxDelayMs=60_000}={}) {
    if (!/^[a-f0-9]{64}$/.test(reportId)) throw new Error('Invalid report ID');
    const row=this.db.prepare("SELECT attempts FROM outgoing WHERE report_id=? AND status='queued'").get(reportId);
    if(!row || !this.enabled) return false;
    const attempts=row.attempts+1;
    const delay=Math.min(maxDelayMs,baseDelayMs*2**Math.min(attempts-1,20));
    this.db.prepare("UPDATE outgoing SET attempts=?,next_attempt=? WHERE report_id=? AND status='queued'")
      .run(attempts,this.now()+delay,reportId);
    return true;
  }
  acknowledge(reportId) {
    if (!/^[a-f0-9]{64}$/.test(reportId)) throw new Error('Invalid report ID');
    // Only after future authenticated transport confirms durable receipt.
    return this.db.prepare("UPDATE outgoing SET status='acknowledged' WHERE report_id=? AND status='queued'")
      .run(reportId).changes===1;
  }
  stats() {
    const rows=this.db.prepare('SELECT status, count(*) AS n FROM outgoing GROUP BY status').all();
    const byStatus=Object.fromEntries(rows.map(x=>[x.status,x.n]));
    return { enabled:this.enabled,queued:byStatus.queued??0,acknowledged:byStatus.acknowledged??0 };
  }
  close() { this.db.close(); }
}
