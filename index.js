import { readFileSync } from 'fs';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { dbUpsertSite, dbGetSite, dbInsertError, dbGetHealthStats, dbPurgeOldData } from './db.js';

let whitelist;
try {
  whitelist = JSON.parse(readFileSync('data/whitelist.json', 'utf8'));
} catch (e) {
  if (e.code === 'ENOENT') {
    console.error('Error: data/whitelist.json not found');
  } else {
    console.error('Error: data/whitelist.json is not valid JSON:', e.message);
  }
  process.exit(1);
}
if (!Array.isArray(whitelist) || whitelist.length === 0) {
  console.error('Error: data/whitelist.json must be a non-empty array');
  process.exit(1);
}
console.log(`Whitelist: ${whitelist.length} domain(s) loaded`);

const whitelistSet = new Set(whitelist.map(d => d.toLowerCase()));
const isWhitelisted = hostname => whitelistSet.has(hostname.toLowerCase());

const SERVER_URL = process.env.SERVER_URL;
if (!SERVER_URL) {
  console.error('Error: SERVER_URL environment variable is required');
  process.exit(1);
}

const PORT = process.env.PORT ?? 3000;

const app = express();

const trustProxy = process.env.TRUST_PROXY;
if (trustProxy && trustProxy !== 'false') {
  app.set('trust proxy', isNaN(trustProxy) ? trustProxy : Number(trustProxy));
}

const healthRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

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
  window.faultsy = {
    report: function (err) {
      report(err instanceof Error ? err.message : String(err));
    }
  };
})();
`;

app.get('/faultsy.js', (req, res) => {
  const referer = req.headers['referer'];
  if (referer) {
    try {
      const { hostname } = new URL(referer);
      if (!isWhitelisted(hostname)) {
        return res.status(403).type('text/plain').send('Domain not whitelisted');
      }
      dbUpsertSite(hostname);
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
  'Access-Control-Allow-Private-Network': 'true',
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

  const site = dbGetSite(hostname);
  if (!site) return res.sendStatus(403);
  if (!isWhitelisted(hostname)) return res.status(403).type('text/plain').send('Domain not whitelisted');

  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  if (new Date(site.last_seen) < oneYearAgo) return res.sendStatus(403);

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.sendStatus(400); }
  }
  const { site: siteField, message, url, ts } = body ?? {};
  if (!siteField || !message || !url || !ts) return res.sendStatus(400);

  dbInsertError(siteField, message, url, ts);
  res.sendStatus(204);
});

app.get('/health', healthRateLimit, (req, res) => {
  const rows = dbGetHealthStats();
  const result = {};
  for (const row of rows) result[row.hostname] = row.cnt;
  res.json(result);
});

app.listen(PORT, () => {
  console.log(`Faultsy listening on ${SERVER_URL}`);

  const timer = setInterval(dbPurgeOldData, 60 * 60 * 1000);
  timer.unref();
});
