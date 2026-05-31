import express from 'express';
import db from './db.js';

const SERVER_URL = process.env.SERVER_URL;
if (!SERVER_URL) {
  console.error('Error: SERVER_URL environment variable is required');
  process.exit(1);
}

const PORT = process.env.PORT ?? 3000;

const app = express();

app.use(express.json());
app.use(express.text({ type: 'text/plain' }));

const SNIPPET = `(function () {
  var SERVER_URL = '{{SERVER_URL}}';
  function report(message, url) {
    navigator.sendBeacon(SERVER_URL + '/errors', JSON.stringify({
      site: location.hostname,
      message: message,
      url: url || location.href,
      ts: new Date().toISOString()
    }));
  }
  window.addEventListener('error', function (e) {
    report(e.message, e.filename);
  });
  window.addEventListener('unhandledrejection', function (e) {
    report(String(e.reason), location.href);
  });
})();
`;

app.get('/faultsy.js', (req, res) => {
  const referer = req.headers['referer'];
  if (referer) {
    try {
      const { hostname } = new URL(referer);
      db.prepare('INSERT OR REPLACE INTO sites (hostname, last_seen) VALUES (?, ?)').run(hostname, new Date().toISOString());
    } catch {
      // invalid Referer — skip registration
    }
  }

  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'max-age=3600');
  res.send(SNIPPET.replace('{{SERVER_URL}}', process.env.SERVER_URL));
});

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

app.options('/errors', (req, res) => {
  res.set(CORS_HEADERS).sendStatus(204);
});

app.post('/errors', (req, res) => {
  res.set(CORS_HEADERS);

  const origin = req.headers['origin'];
  let hostname;
  try {
    hostname = new URL(origin).hostname;
  } catch {
    return res.sendStatus(403);
  }

  const site = db.prepare('SELECT hostname, last_seen FROM sites WHERE hostname = ?').get(hostname);
  if (!site) return res.sendStatus(403);

  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  if (new Date(site.last_seen) < oneYearAgo) return res.sendStatus(403);

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.sendStatus(400); }
  }
  const { site: siteField, message, url, ts } = body ?? {};
  if (!siteField || !message || !url || !ts) return res.sendStatus(400);

  db.prepare('INSERT INTO errors (site, message, url, ts) VALUES (?, ?, ?, ?)').run(siteField, message, url, ts);
  res.sendStatus(204);
});

app.get('/health', (req, res) => {
  const now = new Date();
  const cutoff24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const cutoff1y = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString();

  const rows = db.prepare(`
    SELECT s.hostname, COUNT(e.id) AS cnt
    FROM sites s
    LEFT JOIN errors e
      ON e.site = s.hostname
     AND e.ts >= ?
    WHERE s.last_seen >= ?
    GROUP BY s.hostname
  `).all(cutoff24h, cutoff1y);

  const result = {};
  for (const row of rows) result[row.hostname] = row.cnt;
  res.json(result);
});

app.listen(PORT, () => {
  console.log(`Faultsy listening on ${SERVER_URL}`);

  const purge = db.transaction(() => {
    const now = new Date();
    const cutoff48h = new Date(now - 48 * 60 * 60 * 1000).toISOString();
    const cutoff1y = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString();

    const { changes: deletedErrors } = db.prepare('DELETE FROM errors WHERE ts < ?').run(cutoff48h);
    const { changes: deletedSites } = db.prepare('DELETE FROM sites WHERE last_seen < ?').run(cutoff1y);

    if (deletedErrors > 0 || deletedSites > 0) {
      console.log(`Purge: removed ${deletedErrors} error(s), ${deletedSites} site(s)`);
    }
  });

  const timer = setInterval(purge, 60 * 60 * 1000);
  timer.unref();
});
