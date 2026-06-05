import express from 'express';

const SNIPPET = `(function () {
  var SERVER_URL = {{SERVER_URL}};
  function report(message, url) {
    navigator.sendBeacon(SERVER_URL + '/api/errors', JSON.stringify({
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

export default function snippetRouter({ SERVER_URL, isWhitelisted, dbUpsertSite, logger }) {
  const router = express.Router();

  router.get('/faultsy.js', (req, res) => {
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
      logger.warn('Snippet served without Referer – site will not be registered');
    }

    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'max-age=3600');
    res.send(SNIPPET.replace('{{SERVER_URL}}', JSON.stringify(SERVER_URL)));
  });

  return router;
}
