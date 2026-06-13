import express from 'express';

const MAX_MESSAGE = 2048;
const MAX_URL = 2048;

export function isSafeUrl(url) {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Private-Network': 'true',
};

export default function errorsRouter({ isWhitelisted, dbGetSite, dbInsertError, oneYearAgoCutoff, maybeNotify, logger }) {
  const router = express.Router();

  router.options('/', (req, res) => {
    res.set(CORS_HEADERS).sendStatus(204);
  });

  router.post('/', express.json(), express.text({ type: 'text/plain' }), (req, res) => {
    const reqId = crypto.randomUUID().slice(0, 8);
    res.set(CORS_HEADERS);

    const origin = req.headers['origin'];
    let hostname;
    try {
      hostname = new URL(origin).hostname;
    } catch {
      logger.warn('[%s] Error POST rejected – invalid Origin header', reqId);
      return res.sendStatus(403);
    }

    const site = dbGetSite(hostname);
    if (!site || !isWhitelisted(hostname)) {
      logger.warn('[%s] Error POST rejected – unregistered or non-whitelisted hostname: %s', reqId, hostname);
      return res.sendStatus(403);
    }

    if (site.last_seen < oneYearAgoCutoff()) {
      logger.warn('[%s] Error POST rejected – site inactive: %s', reqId, hostname);
      return res.sendStatus(403);
    }

    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch {
        logger.warn('[%s] Error POST rejected – invalid JSON body from %s', reqId, hostname);
        return res.sendStatus(400);
      }
    }
    const { message, url } = body ?? {};
    if (typeof message !== 'string' || message.length === 0 || message.length > MAX_MESSAGE) {
      logger.warn('[%s] Error POST rejected – invalid payload from %s', reqId, hostname);
      return res.sendStatus(400);
    }
    if (typeof url !== 'string' || url.length === 0 || url.length > MAX_URL || !isSafeUrl(url)) {
      logger.warn('[%s] Error POST rejected – invalid payload from %s', reqId, hostname);
      return res.sendStatus(400);
    }

    dbInsertError(hostname, message, url);
    maybeNotify(hostname);
    logger.debug('[%s] Error recorded for %s', reqId, hostname);
    res.sendStatus(204);
  });

  return router;
}
