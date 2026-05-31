import express from 'express';
import db from './db.js';

const SERVER_URL = process.env.SERVER_URL;
if (!SERVER_URL) {
  console.error('Error: SERVER_URL environment variable is required');
  process.exit(1);
}

const PORT = process.env.PORT ?? 3000;

const app = express();

const SNIPPET = `(function () {
  var SERVER_URL = '{{SERVER_URL}}';
  window.addEventListener('error', function (e) {
    navigator.sendBeacon(SERVER_URL + '/errors', JSON.stringify({
      site: location.hostname,
      message: e.message,
      url: e.filename,
      ts: new Date().toISOString()
    }));
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

app.get('/health', (req, res) => {
  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`Faultsy listening on ${SERVER_URL}`);
});
