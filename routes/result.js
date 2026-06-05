import express from 'express';

const RESULT_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization',
};

export default function resultRouter({ RESULT_TOKEN, dbGetSiteErrorCount, logger }) {
  const router = express.Router();

  router.options('/:hostname', (req, res) => {
    res.set(RESULT_CORS_HEADERS).sendStatus(204);
  });

  router.get('/:hostname', (req, res) => {
    res.set(RESULT_CORS_HEADERS);

    const auth = req.headers['authorization'];
    if (!RESULT_TOKEN || auth !== `Bearer ${RESULT_TOKEN}`) {
      return res.status(401).json({ status: 'unauthorized' });
    }

    const { hostname } = req.params;
    const count = dbGetSiteErrorCount(hostname);

    if (count === null) return res.status(404).json({ status: 'unknown', site: hostname });
    if (count > 0)      return res.status(503).json({ status: 'errors', site: hostname, count });
    return res.status(200).json({ status: 'ok', site: hostname });
  });

  return router;
}
