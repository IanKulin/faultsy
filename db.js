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
    hostname      TEXT PRIMARY KEY,
    last_seen     TEXT NOT NULL,
    snippet_hits  INTEGER NOT NULL DEFAULT 0
  );
`);

// This can come out after migrating the test db's
try {
  db.exec(`ALTER TABLE sites ADD COLUMN snippet_hits INTEGER NOT NULL DEFAULT 0`);
} catch {
  // column already exists — safe to ignore
}

const stmts = {
  upsertSite:       db.prepare(`
    INSERT INTO sites (hostname, last_seen, snippet_hits)
    VALUES (?, ?, 1)
    ON CONFLICT(hostname) DO UPDATE SET
      last_seen    = excluded.last_seen,
      snippet_hits = snippet_hits + 1
  `),
  getSite:          db.prepare('SELECT hostname, last_seen, snippet_hits FROM sites WHERE hostname = ?'),
  insertError:      db.prepare('INSERT INTO errors (site, message, url, ts) VALUES (?, ?, ?, ?)'),
  deleteOldErrors:  db.prepare('DELETE FROM errors WHERE ts < ?'),
  deleteOldSites:   db.prepare('DELETE FROM sites WHERE last_seen < ?'),
  siteErrorCount:   db.prepare(`
    SELECT s.hostname, COUNT(e.id) AS cnt
    FROM sites s
    LEFT JOIN errors e
      ON e.site = s.hostname
     AND e.ts >= ?
    WHERE s.hostname = ?
    GROUP BY s.hostname
  `),
  allSitesSummary:  db.prepare(`
    SELECT s.hostname, s.last_seen, s.snippet_hits, COUNT(e.id) AS error_count
    FROM sites s
    LEFT JOIN errors e ON e.site = s.hostname AND e.ts >= ?
    GROUP BY s.hostname
    ORDER BY s.hostname
  `),
  lastErrorForSite: db.prepare('SELECT message, ts FROM errors WHERE site = ? ORDER BY ts DESC LIMIT 1'),
  siteErrors:       db.prepare('SELECT message, url, ts FROM errors WHERE site = ? ORDER BY ts DESC LIMIT 100'),
};

export function oneYearAgoCutoff() {
  return new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
}

export function dbUpsertSite(hostname) {
  stmts.upsertSite.run(hostname, new Date().toISOString());
}

export function dbGetSite(hostname) {
  return stmts.getSite.get(hostname);
}

export function dbInsertError(site, message, url) {
  stmts.insertError.run(site, message, url, new Date().toISOString());
}

export function dbGetSiteErrorCount(hostname) {
  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const row = stmts.siteErrorCount.get(cutoff24h, hostname);
  return row ? row.cnt : null;
}

export const dbPurgeOldData = db.transaction(() => {
  const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const cutoff1y = oneYearAgoCutoff();

  const { changes: errors } = stmts.deleteOldErrors.run(cutoff48h);
  const { changes: sites } = stmts.deleteOldSites.run(cutoff1y);

  return { errors, sites };
});

export function dbGetAllSitesSummary() {
  const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  return stmts.allSitesSummary.all(cutoff48h);
}

export function dbGetLastErrorForSite(hostname) {
  return stmts.lastErrorForSite.get(hostname);
}

export function dbGetSiteErrors(hostname) {
  return stmts.siteErrors.all(hostname);
}

export function dbClose() { db.close(); }
