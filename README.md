# Faultsy

A self-hosted browser error collector. Faultsy catches unhandled JavaScript errors on your websites and exposes them through a `/results` endpoint that uptime monitors like Uptime Kuma can poll — so a spike in JS errors alerts you the same way a server outage would.

## How it works

1. You add a `<script>` tag to your site pointing at your Faultsy server.
2. The script hooks into `window.onerror` and `unhandledrejection`. When either fires, it sends the error to Faultsy via `navigator.sendBeacon`.
3. Faultsy stores errors in a local SQLite database.
4. Your uptime monitor polls `/results`, which returns per-site error counts for the last 24 hours. Zero errors = healthy. Any errors = alert.

Data older than 48 hours is purged automatically. Sites that haven't loaded the script in over a year are removed.

## Adding monitoring to your site

Add this to every page you want to monitor, ideally in `<head>`:

```html
<script src="https://your-faultsy-server.com/faultsy.js"></script>
```

Replace `your-faultsy-server.com` with the public URL of your Faultsy deployment.

The script registers your site automatically on first load. It only captures **unhandled** errors — anything inside a `try/catch` is not reported.

You can also report errors manually:

```js
try {
  riskyThing();
} catch (err) {
  window.faultsy?.report(err);
}
```

## Deployment

### Prerequisites

- Docker and Docker Compose
- A domain or IP with the port publicly accessible (or behind a reverse proxy)

### 1. Create a `.env` file

```env
SERVER_URL=https://your-faultsy-server.com
PORT=3000
TRUST_PROXY=1
```

`SERVER_URL` is injected into the client snippet at request time — browsers use it to know where to send errors. It must be the public URL of this server, with no trailing slash.

`TRUST_PROXY` configures Express's `trust proxy` setting for correct IP detection behind a reverse proxy. Set to `1` if there is one proxy in front of Faultsy (the typical case), or a higher number for deeper proxy chains. Omit it (or set to `false`) if Faultsy is exposed directly. Without this, the `/results` rate limiter will see the proxy's IP instead of the real client IP.

### 2. Create the whitelist

Create `data/whitelist.json` before starting the server. This controls which domains are allowed to register and submit errors:

```json
["example.com", "otherwebsite.com"]
```

The `data/` directory sits next to `docker-compose.yaml`. The database file (`faultsy.db`) is also stored there and is persisted via a Docker volume.

### 3. Start the server

```bash
docker compose up -d
```

The Docker image is `ghcr.io/iankulin/faultsy`. The compose file mounts a named volume for `data/` so the database and whitelist survive restarts and container updates.

To update to a new image version:

```bash
docker compose pull && docker compose up -d
```

### Running without Docker

```bash
npm install
SERVER_URL=https://your-faultsy-server.com npm start
```

Or with a `.env` file and `npm start` directly (uses `--env-file=.env` via the start script).

## Monitoring with Uptime Kuma

Set up a **Keyword** monitor for each site you want to track:

| Field | Value |
|---|---|
| Monitor Type | HTTP(s) - Keyword |
| URL | `https://your-faultsy-server.com/results` |
| Keyword | `"example.com":0` |
| Keyword status | `Keyword exists` (default) |

The `/results` endpoint returns JSON like:

```json
{"example.com":0,"otherwebsite.com":0}
```

The keyword `"example.com":0` is present when there are no errors. When errors are recorded, the count becomes non-zero and the keyword disappears from the response — Uptime Kuma marks the monitor as down and alerts you.

Create one monitor per domain you want to track independently.

## AI Disclosure

AI tools where used in the production of this software

## License

MIT