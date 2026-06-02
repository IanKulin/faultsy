import { readFileSync } from 'fs';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import Logger from '@iankulin/logger';
import { dbUpsertSite, dbGetSite, dbInsertError, dbGetHealthStats, dbPurgeOldData, dbClose, oneYearAgoCutoff } from './db.js';

const logger = new Logger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: process.env.LOG_FORMAT ?? 'simple',
  callerLevel: process.env.NODE_ENV === 'production' ? 'error' : 'warn',
});

let whitelist;
try {
  whitelist = JSON.parse(readFileSync('data/whitelist.json', 'utf8'));
} catch (e) {
  if (e.code === 'ENOENT') {
    logger.error('data/whitelist.json not found');
  } else {
    logger.error('data/whitelist.json is not valid JSON: %s', e.message);
  }
  process.exit(1);
}
if (!Array.isArray(whitelist) || whitelist.length === 0) {
  logger.error('data/whitelist.json must be a non-empty array');
  process.exit(1);
}
logger.info('Whitelist loaded: %d domain(s)', whitelist.length);

const whitelistSet = new Set(whitelist.map(d => d.toLowerCase()));
const isWhitelisted = hostname => whitelistSet.has(hostname.toLowerCase());

const SERVER_URL = process.env.SERVER_URL;
if (!SERVER_URL) {
  logger.error('SERVER_URL environment variable is required');
  process.exit(1);
}

const PORT = process.env.PORT ?? 3000;

const app = express();

app.use(helmet());

const trustProxy = process.env.TRUST_PROXY;
if (trustProxy && trustProxy !== 'false') {
  const VALID_TRUST_PROXY_STRINGS = new Set(['loopback', 'linklocal', 'uniquelocal']);
  const asInt = parseInt(trustProxy, 10);
  const isInt = Number.isInteger(asInt) && String(asInt) === trustProxy;
  if (!isInt && !VALID_TRUST_PROXY_STRINGS.has(trustProxy)) {
    logger.error('Invalid TRUST_PROXY value: "%s". Use an integer or loopback/linklocal/uniquelocal.', trustProxy);
    process.exit(1);
  }
  app.set('trust proxy', isInt ? asInt : trustProxy);
}

const ipKeyGenerator = (ip = '') =>
  ip.includes(':') ? ip.split(':').slice(0, 4).join(':') : ip;

const rateLimitHandler = (req, res, next, options) => {
  logger.warn('Rate limit hit: %s', req.ip);
  res.status(options.statusCode).send(options.message);
};

const healthRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
  handler: rateLimitHandler,
});

const errorsRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
  handler: rateLimitHandler,
});

const snippetRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
  handler: rateLimitHandler,
});


const SNIPPET = `(function () {
  var SERVER_URL = {{SERVER_URL}};
  function report(message, url) {
    navigator.sendBeacon(SERVER_URL + '/errors', JSON.stringify({
      site: location.hostname,
      message: message,
      url: url || location.href
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

app.get('/faultsy.js', snippetRateLimit, (req, res) => {
  const referer = req.headers['referer'];
  if (referer) {
    try {
      const { hostname } = new URL(referer);
      if (!isWhitelisted(hostname)) {
        logger.warn('Snippet request rejected – domain not whitelisted: %s', hostname);
        return res.status(403).type('text/plain').send('Domain not whitelisted');
      }
      dbUpsertSite(hostname);
      logger.debug('Site registered: %s', hostname);
    } catch {
      // invalid Referer — skip registration
    }
  } else {
    logger.debug('Snippet served – no Referer');
  }

  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'max-age=3600');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.send(SNIPPET.replace('{{SERVER_URL}}', JSON.stringify(SERVER_URL)));
});

const MAX_MESSAGE = 2048;
const MAX_URL = 2048;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Private-Network': 'true',
  'Cross-Origin-Resource-Policy': 'cross-origin',
};

app.options('/errors', (req, res) => {
  res.set(CORS_HEADERS).sendStatus(204);
});

app.post('/errors', errorsRateLimit, express.json(), express.text({ type: 'text/plain' }), (req, res) => {
  res.set(CORS_HEADERS);

  const origin = req.headers['origin'];
  let hostname;
  try {
    hostname = new URL(origin).hostname;
  } catch {
    logger.warn('Error POST rejected – invalid Origin header');
    return res.sendStatus(403);
  }

  const site = dbGetSite(hostname);
  if (!site || !isWhitelisted(hostname)) {
    logger.warn('Error POST rejected – unregistered or non-whitelisted hostname: %s', hostname);
    return res.sendStatus(403);
  }

  if (site.last_seen < oneYearAgoCutoff()) {
    logger.warn('Error POST rejected – site inactive: %s', hostname);
    return res.sendStatus(403);
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch {
      logger.warn('Error POST rejected – invalid JSON body from %s', hostname);
      return res.sendStatus(400);
    }
  }
  const { message, url } = body ?? {};
  if (typeof message !== 'string' || message.length === 0 || message.length > MAX_MESSAGE) {
    logger.warn('Error POST rejected – invalid payload from %s', hostname);
    return res.sendStatus(400);
  }
  if (typeof url !== 'string' || url.length === 0 || url.length > MAX_URL) {
    logger.warn('Error POST rejected – invalid payload from %s', hostname);
    return res.sendStatus(400);
  }

  dbInsertError(hostname, message, url);
  logger.debug('Error recorded for %s', hostname);
  res.sendStatus(204);
});

app.get('/results', healthRateLimit, (req, res) => {
  const rows = dbGetHealthStats();
  const result = {};
  for (const row of rows) result[row.hostname] = row.cnt;
  res.json(result);
});

app.use((req, res) => {
  res.status(404).type('text/plain').send('Not found');
});

app.use((err, req, res, _next) => {
  logger.error('Unhandled error: %s', err.message);
  res.status(500).type('text/plain').send('Internal server error');
});

const server = app.listen(PORT, () => {
  logger.info('Faultsy listening on %s', SERVER_URL);

  const timer = setInterval(() => {
    const { errors, sites } = dbPurgeOldData();
    logger.debug('Maintenance: purged %d error(s), %d site(s)', errors, sites);
  }, 60 * 60 * 1000);
  timer.unref();
});

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('Shutting down');
  const forceExit = setTimeout(() => {
    logger.error('Shutdown timed out; forcing exit');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close(() => {
    dbClose();
    logger.info('Goodbye');
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
