process.env.NODE_ENV ||= 'production';

import { readFileSync } from 'fs';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import csrfProtection from 'small-csrf';
import Logger from '@iankulin/logger';
import { dbUpsertSite, dbGetSite, dbInsertError, dbGetSiteErrorCount, dbPurgeOldData, dbClose, oneYearAgoCutoff, dbGetAllSitesSummary, dbGetSiteErrors } from './db.js';
import { SqliteSessionStore } from './session-store.js';
import snippetRouter from './routes/snippet.js';
import errorsRouter from './routes/errors.js';
import resultRouter from './routes/result.js';
import authRouter from './routes/auth.js';
import dashboardRouter from './routes/dashboard.js';

const logger = new Logger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: process.env.LOG_FORMAT ?? 'simple',
  callerLevel: process.env.NODE_ENV === 'production' ? 'error' : 'warn',
});

const WHITELIST_PATH = process.env.WHITELIST_PATH ?? 'data/whitelist.json';
let whitelist;
try {
  whitelist = JSON.parse(readFileSync(WHITELIST_PATH, 'utf8'));
} catch (e) {
  if (e.code === 'ENOENT') {
    logger.error('%s not found', WHITELIST_PATH);
  } else {
    logger.error('%s is not valid JSON: %s', WHITELIST_PATH, e.message);
  }
  process.exit(1);
}
if (!Array.isArray(whitelist) || whitelist.length === 0) {
  logger.error('%s must be a non-empty array', WHITELIST_PATH);
  process.exit(1);
}
const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
for (const entry of whitelist) {
  if (typeof entry !== 'string' || !HOSTNAME_RE.test(entry)) {
    logger.error('Invalid whitelist entry: %j — must be a plain hostname (e.g. "example.com")', entry);
    process.exit(1);
  }
}
logger.info('Whitelist loaded: %d domain(s)', whitelist.length);

const whitelistSet = new Set(whitelist.map(d => d.toLowerCase()));
const isWhitelisted = hostname => whitelistSet.has(hostname.toLowerCase());

const SERVER_URL = process.env.SERVER_URL;
if (!SERVER_URL) {
  logger.error('SERVER_URL environment variable is required');
  process.exit(1);
}

const RESULT_TOKEN = process.env.RESULT_TOKEN ?? null;
if (!RESULT_TOKEN) logger.warn('RESULT_TOKEN is not set; /api/result/:hostname will always return 401');

const DASHBOARD_SESSION_SECRET = process.env.DASHBOARD_SESSION_SECRET;
if (!DASHBOARD_SESSION_SECRET) {
  logger.error('DASHBOARD_SESSION_SECRET environment variable is required');
  process.exit(1);
}

const DASHBOARD_PASSWORD_HASH = process.env.DASHBOARD_PASSWORD_HASH;
if (!DASHBOARD_PASSWORD_HASH) {
  logger.error('DASHBOARD_PASSWORD_HASH environment variable is required');
  process.exit(1);
}

const DASHBOARD_USER = process.env.DASHBOARD_USER || 'admin';
if (!process.env.DASHBOARD_USER) logger.warn('DASHBOARD_USER is not set; defaulting to "admin"');

const PORT = process.env.PORT ?? 3000;

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

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

app.use(rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  skip: () => process.env.NODE_ENV === 'test',
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
  handler: (req, res, next, options) => {
    logger.warn('Rate limit hit: %s', req.ip);
    res.status(options.statusCode).send(options.message);
  },
}));

app.use(express.static('public'));
app.get('/favicon.ico', (_req, res) => res.redirect(301, '/favicon.svg'));

app.use(express.urlencoded({ extended: false }));

const sessionStore = new SqliteSessionStore({
  path: process.env.SESSION_DB_PATH ?? 'data/sessions.db',
});

app.use(session({
  secret: DASHBOARD_SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    httpOnly: true,
    secure: SERVER_URL.startsWith('https://'),
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000,
  },
}));

app.use(cookieParser());

const csrf = csrfProtection({ secret: DASHBOARD_SESSION_SECRET });

app.use(authRouter({ DASHBOARD_USER, DASHBOARD_PASSWORD_HASH, csrf }));
app.use(dashboardRouter({ dbGetAllSitesSummary, dbGetSiteErrors, dbGetSite, csrf }));
app.use(snippetRouter({ SERVER_URL, isWhitelisted, dbUpsertSite, logger }));
app.use('/api/errors', errorsRouter({ isWhitelisted, dbGetSite, dbInsertError, oneYearAgoCutoff, logger }));
app.use('/api/result', resultRouter({ RESULT_TOKEN, dbGetSiteErrorCount, logger }));

// Temporary compat redirects — remove once cached snippets pointing to /errors are unlikely
app.post('/errors', (req, res) => res.redirect(308, '/api/errors'));
app.options('/errors', (req, res) => res.redirect(308, '/api/errors'));

app.use((req, res) => {
  res.status(404).type('text/plain').send('Not found');
});

app.use((err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') return res.status(403).type('text/plain').send('Bad request');
  next(err);
});

app.use((err, req, res, _next) => {
  logger.error('Unhandled error: %s', err.message);
  res.status(500).type('text/plain').send('Internal server error');
});

const server = app.listen(PORT, () => {
  logger.info('Faultsy listening on %s', SERVER_URL);

  const timer = setInterval(() => {
    try {
      const { errors, sites } = dbPurgeOldData();
      logger.debug('Maintenance: purged %d error(s), %d site(s)', errors, sites);
    } catch (err) {
      logger.error('Maintenance purge failed: %s', err.message);
    }
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
    sessionStore.close();
    dbClose();
    logger.info('Goodbye');
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
