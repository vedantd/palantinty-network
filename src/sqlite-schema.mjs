/**
 * Minimal versioned SQLite schema bootstrap for prototype stores.
 *
 * v0 is the original unversioned schema. v1 records that the expected tables
 * and indexes exist. Unknown future versions fail closed rather than being
 * silently opened by older binaries.
 *
 * This is not a general-purpose migration framework: future destructive
 * changes must have explicit migrations and backup/recovery procedures.
 */
export function initializeStore(db, {kind,createSchema,requiredTables}) {
  if (!['outbox','regional'].includes(kind) ||
      typeof createSchema !== 'string' || !Array.isArray(requiredTables))
    throw new TypeError('Invalid SQLite store configuration');
  const version=db.prepare('PRAGMA user_version').get().user_version;
  if (!Number.isSafeInteger(version) || version < 0 || version > 1)
    throw new Error('Unsupported '+kind+' database schema version: '+version);
  const integrity=db.prepare('PRAGMA integrity_check').get();
  if (integrity?.integrity_check !== 'ok')
    throw new Error('SQLite '+kind+' integrity check failed');
  const objects=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()
    .map(r=>r.name);
  if (version === 0 && objects.length &&
      !requiredTables.every(name=>objects.includes(name)))
    throw new Error('Incomplete legacy '+kind+' database; refusing implicit repair');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(createSchema);
    for (const table of requiredTables) {
      if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))
        throw new Error('Missing required '+kind+' table: '+table);
    }
    if (version===0) db.exec('PRAGMA user_version=1');
    db.exec('COMMIT');
  } catch(error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
