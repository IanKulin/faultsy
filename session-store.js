import Database from 'better-sqlite3';
import { Store } from 'express-session';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class SqliteSessionStore extends Store {
  constructor(options = {}) {
    super();
    const path = options.path ?? join(__dirname, 'data', 'sessions.db');
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.pragma('synchronous = NORMAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid     TEXT PRIMARY KEY,
        data    TEXT NOT NULL,
        expires INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires);
    `);
    this.stmts = {
      get: this.db.prepare('SELECT data FROM sessions WHERE sid = ? AND expires > ?'),
      set: this.db.prepare('INSERT OR REPLACE INTO sessions (sid, data, expires) VALUES (?, ?, ?)'),
      touch: this.db.prepare('UPDATE sessions SET expires = ? WHERE sid = ?'),
      destroy: this.db.prepare('DELETE FROM sessions WHERE sid = ?'),
      clear: this.db.prepare('DELETE FROM sessions'),
      deleteExpired: this.db.prepare('DELETE FROM sessions WHERE expires <= ?'),
    };
    this.pruneTimer = setInterval(() => this.stmts.deleteExpired.run(Date.now()), 60 * 60 * 1000);
    this.pruneTimer.unref();
  }

  #expires(sess) {
    if (sess.cookie?.expires) return new Date(sess.cookie.expires).getTime();
    if (sess.cookie?.maxAge) return Date.now() + sess.cookie.maxAge;
    return Date.now() + 86_400_000;
  }

  get(sid, cb) {
    try {
      const row = this.stmts.get.get(sid, Date.now());
      cb(null, row ? JSON.parse(row.data) : null);
    } catch (err) {
      cb(err);
    }
  }

  set(sid, sess, cb) {
    try {
      this.stmts.set.run(sid, JSON.stringify(sess), this.#expires(sess));
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  destroy(sid, cb) {
    try {
      this.stmts.destroy.run(sid);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  touch(sid, sess, cb) {
    try {
      this.stmts.touch.run(this.#expires(sess), sid);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  clear(cb) {
    try {
      this.stmts.clear.run();
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  close() {
    clearInterval(this.pruneTimer);
    this.db.close();
  }
}
