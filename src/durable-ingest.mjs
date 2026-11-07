import { initializeStore } from './sqlite-schema.mjs';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, lstatSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { verifyEnvelope } from './protocol.mjs';

/**
 * M05 experimental durable regional ingest.
 * This is a CONFIDENTIAL recipient for explicitly authorized SYNTHETIC
 * observations. No public feed, no real BLE data, no location attestation.
 *
 * The ACK is issued ONLY after SQLite FULL-synchronous transaction commits.
 * The replay high-water mark, report ID and one-per-signer-per-cell contribution
 * survive a process restart in the same database.
 */
export class DurableRegionalIngest {
  constructor({ dbPath, authorizedKeys, now = () => Date.now(),
    maxAgeMs = 24 * 60 * 60_000, releaseDelayMs = 15 * 60_000,
    minOperators = 2, maxStoredReports = 100_000 } = {}) {
    if (typeof dbPath !== 'string' || !dbPath.trim()) throw new TypeError('dbPath required');
    if (!(authorizedKeys instanceof Set) || authorizedKeys.size === 0 ||
        ![...authorizedKeys].every(k => /^[a-f0-9]{64}$/.test(k)))
      throw new TypeError('Explicit set of authorized Ed25519 signing key IDs required');
    for (const [name,value,min] of [
      ['maxAgeMs',maxAgeMs,60_000],['releaseDelayMs',releaseDelayMs,15*60_000],
      ['minOperators',minOperators,2],['maxStoredReports',maxStoredReports,1]]) {
      if (!Number.isSafeInteger(value) || value < min) throw new RangeError(name);
    }
    this.authorizedKeys = new Set(authorizedKeys);
    this.now = now;
    this.maxAgeMs = maxAgeMs;
    this.releaseDelayMs = releaseDelayMs;
    this.minOperators = minOperators;
    this.maxStoredReports = maxStoredReports;

    const file = path.resolve(dbPath);
    const directory = path.dirname(file);
    mkdirSync(directory, { recursive:true, mode:0o700 });
    const dirInfo = lstatSync(directory);
    if (!dirInfo.isDirectory() || dirInfo.isSymbolicLink() || dirInfo.mode & 0o077)
      throw new Error('Indexer directory must be private (mode 0700)');
    if (existsSync(file)) {
      const state = lstatSync(file);
      if (!state.isFile() || state.isSymbolicLink() || state.mode & 0o077)
        throw new Error('Indexer database must be private regular file (mode 0600)');
    }
    this.db = new DatabaseSync(file);
    chmodSync(file,0o600);
    this.db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
    initializeStore(this.db,{kind:'regional',requiredTables:['contributor_sequences','accepted_reports'],createSchema:`
      CREATE TABLE IF NOT EXISTS contributor_sequences (
        key_id TEXT PRIMARY KEY,
        highest_sequence INTEGER NOT NULL CHECK(highest_sequence >= 1)
      );
      CREATE TABLE IF NOT EXISTS accepted_reports (
        report_id TEXT PRIMARY KEY,
        key_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        area TEXT NOT NULL,
        bucket_start INTEGER NOT NULL,
        bucket_seconds INTEGER NOT NULL,
        activity_index INTEGER NOT NULL,
        received_at INTEGER NOT NULL,
        UNIQUE(key_id, sequence),
        UNIQUE(key_id,area,bucket_start,bucket_seconds)
      );
      CREATE INDEX IF NOT EXISTS regional_series
        ON accepted_reports(area,bucket_start,bucket_seconds);
    `});
  }

  ingest(envelope) {
    let body;
    try { body = verifyEnvelope(envelope); }
    catch { return { accepted:false,ack:false,code:'invalid_signature_or_schema' }; }
    if (!this.authorizedKeys.has(body.keyId))
      return { accepted:false,ack:false,code:'unauthorized_signer' };

    const r = body.report, clock = this.now();
    const end = r.bucketStart + r.bucketSeconds * 1000;
    if (!Number.isSafeInteger(end) || end > clock - this.releaseDelayMs ||
        end < clock - this.maxAgeMs)
      return { accepted:false,ack:false,code:'outside_ingest_window' };

    this.db.exec('BEGIN IMMEDIATE');
    try {
      const duplicate=this.db.prepare('SELECT 1 FROM accepted_reports WHERE report_id=?')
        .get(body.reportId);
      if (duplicate) {
        this.db.exec('COMMIT');
        return { accepted:false,ack:true,duplicate:true,code:'already_accepted',
          reportId:body.reportId };
      }
      const high=this.db.prepare('SELECT highest_sequence AS seq FROM contributor_sequences WHERE key_id=?')
        .get(body.keyId)?.seq ?? 0;
      if (body.sequence <= high) {
        this.db.exec('ROLLBACK');
        return { accepted:false,ack:false,code:'stale_sequence' };
      }
      const already=this.db.prepare(`SELECT 1 FROM accepted_reports
        WHERE key_id=? AND area=? AND bucket_start=? AND bucket_seconds=?`)
        .get(body.keyId,r.area,r.bucketStart,r.bucketSeconds);
      if (already) {
        this.db.exec('ROLLBACK');
        return { accepted:false,ack:false,code:'already_contributed_to_window' };
      }
      const total=this.db.prepare('SELECT count(*) AS n FROM accepted_reports').get().n;
      if (total >= this.maxStoredReports) {
        this.db.exec('ROLLBACK');
        return { accepted:false,ack:false,code:'index_full' };
      }
      this.db.prepare(`INSERT INTO accepted_reports
        (report_id,key_id,sequence,area,bucket_start,bucket_seconds,activity_index,received_at)
        VALUES(?,?,?,?,?,?,?,?)`).run(body.reportId,body.keyId,body.sequence,
        r.area,r.bucketStart,r.bucketSeconds,r.activityIndex,clock);
      this.db.prepare(`INSERT INTO contributor_sequences(key_id,highest_sequence)
        VALUES(?,?) ON CONFLICT(key_id) DO UPDATE SET highest_sequence=excluded.highest_sequence`)
        .run(body.keyId,body.sequence);
      this.db.exec('COMMIT');
      return { accepted:true,ack:true,duplicate:false,code:'accepted',reportId:body.reportId };
    } catch(error) {
      this.db.exec('ROLLBACK');
      throw error; // A storage failure never generates an ACK.
    }
  }

  /**
   * Release only aggregate regional series once minimum independent signing
   * keys are present. This is an experimental synthetic output, NOT anonymity.
   */
  query({ area, start = 0, end = Number.MAX_SAFE_INTEGER, limit = 100 } = {}) {
    if (typeof area !== 'string' || !/^[a-z0-9][a-z0-9._-]{2,63}$/.test(area) ||
        !Number.isSafeInteger(start) || start < 0 ||
        !Number.isSafeInteger(end) || end <= start ||
        !Number.isSafeInteger(limit) || limit < 1 || limit > 500)
      throw new Error('Invalid aggregate query');
    const rows=this.db.prepare(`SELECT area,bucket_start,bucket_seconds,
      count(DISTINCT key_id) AS sources, avg(activity_index) AS activity
      FROM accepted_reports
      WHERE area=? AND bucket_start>=? AND bucket_start<?
      GROUP BY area,bucket_start,bucket_seconds
      HAVING count(DISTINCT key_id)>=?
      ORDER BY bucket_start ASC LIMIT ?`)
      .all(area,start,end,this.minOperators,limit);
    return rows.map(r=>({
      area:r.area,bucketStart:r.bucket_start,bucketSeconds:r.bucket_seconds,
      sources:r.sources,relativeBleActivity:Math.round(r.activity),
      status:'experimental_synthetic_only'
    }));
  }

  stats() {
    return { accepted:this.db.prepare('SELECT count(*) AS n FROM accepted_reports').get().n,
      contributors:this.db.prepare('SELECT count(*) AS n FROM contributor_sequences').get().n,
      authorizedKeys:this.authorizedKeys.size };
  }
  close() { this.db.close(); }
}
