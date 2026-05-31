import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';

mkdirSync('data', { recursive: true });

const db = new Database('data/faultsy.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS errors (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    site    TEXT NOT NULL,
    message TEXT NOT NULL,
    url     TEXT NOT NULL,
    ts      TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sites (
    hostname  TEXT PRIMARY KEY,
    last_seen TEXT NOT NULL
  );
`);

export default db;
