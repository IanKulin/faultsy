import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';

mkdirSync('data', { recursive: true });

const db = new Database('data/faultsy.db');
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.pragma('synchronous = NORMAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS errors (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    site    TEXT NOT NULL,
    message TEXT NOT NULL,
    url     TEXT NOT NULL,
    ts      TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_errors_ts      ON errors (ts);
  CREATE INDEX IF NOT EXISTS idx_errors_site_ts ON errors (site, ts);

  CREATE TABLE IF NOT EXISTS sites (
    hostname  TEXT PRIMARY KEY,
    last_seen TEXT NOT NULL
  );
`);

const stmts = {
  upsertSite:       db.prepare('INSERT OR REPLACE INTO sites (hostname, last_seen) VALUES (?, ?)'),
  getSite:          db.prepare('SELECT hostname, last_seen FROM sites WHERE hostname = ?'),
  insertError:      db.prepare('INSERT INTO errors (site, message, url, ts) VALUES (?, ?, ?, ?)'),
  deleteOldErrors:  db.prepare('DELETE FROM errors WHERE ts < ?'),
  deleteOldSites:   db.prepare('DELETE FROM sites WHERE last_seen < ?'),
  healthStats:      db.prepare(`
    SELECT s.hostname, COUNT(e.id) AS cnt
    FROM sites s
    LEFT JOIN errors e
      ON e.site = s.hostname
     AND e.ts >= ?
    WHERE s.last_seen >= ?
    GROUP BY s.hostname
  `),
};

export function dbUpsertSite(hostname) {
  stmts.upsertSite.run(hostname, new Date().toISOString());
}

export function dbGetSite(hostname) {
  return stmts.getSite.get(hostname);
}

export function dbInsertError(site, message, url) {
  stmts.insertError.run(site, message, url, new Date().toISOString());
}

export function dbGetHealthStats() {
  const now = new Date();
  const cutoff24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const cutoff1y = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString();
  return stmts.healthStats.all(cutoff24h, cutoff1y);
}

export const dbPurgeOldData = db.transaction(() => {
  const now = new Date();
  const cutoff48h = new Date(now - 48 * 60 * 60 * 1000).toISOString();
  const cutoff1y = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString();

  const { changes: deletedErrors } = stmts.deleteOldErrors.run(cutoff48h);
  const { changes: deletedSites } = stmts.deleteOldSites.run(cutoff1y);

  return deletedErrors + deletedSites;
});

export function dbClose() { db.close(); }
