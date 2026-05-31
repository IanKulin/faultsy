import express from 'express';
import './db.js';

const SERVER_URL = process.env.SERVER_URL;
if (!SERVER_URL) {
  console.error('Error: SERVER_URL environment variable is required');
  process.exit(1);
}

const PORT = process.env.PORT ?? 3000;

const app = express();

app.get('/health', (req, res) => {
  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`Faultsy listening on ${SERVER_URL}`);
});
