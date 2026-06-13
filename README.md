# Faultsy

A self-hosted browser error collector. Faultsy catches unhandled JavaScript errors on web pages and exposes them through a per-site API endpoint that uptime monitors like Uptime Kuma can poll — so a spike in JS errors alerts you the same way a server outage would.

## How it works

1. You add a `<script>` tag to your site pointing at your Faultsy server.
2. The script hooks into `window.onerror` and `unhandledrejection`. When either fires, it sends the error to Faultsy via `navigator.sendBeacon`.
3. Faultsy stores errors in a local SQLite database.
4. Your uptime monitor polls `/api/result/<hostname>`, which returns `200` (no errors) or `503` (errors detected) for that site.

Data older than 48 hours is purged automatically. Sites that haven't loaded the script in over a year are removed.

## Security model

Faultsy validates error submissions against a domain whitelist and checks the `Origin` header sent by browsers. Browsers enforce `Origin` and JavaScript cannot override it, so this reliably identifies which site is sending errors.

However, `Origin` can be set to any value by a server-side script. Anyone who knows your Faultsy URL and a whitelisted hostname could inject fake errors. This is the same limitation that applies to all client-side error collectors (including Sentry) — there is no way to authenticate a browser without embedding a secret in the page, and any secret in client-side JavaScript is effectively public.

The practical risk is low: an attacker can pollute your error log and trigger spurious alerts, but cannot read data or affect anything outside Faultsy. Rate limiting (30 req/min per IP) constrains bulk injection.

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

- Docker Compose
- A domain or IP with the port publicly accessible (or behind a reverse proxy)

### 1. Create a `.env` file

```env
SERVER_URL=https://your-faultsy-server.com
PORT=3000
TRUST_PROXY=1
RESULT_TOKEN=a-long-random-secret
DASHBOARD_SESSION_SECRET=a-long-random-secret
DASHBOARD_PASSWORD_HASH=$$2b$$10$$...
DASHBOARD_USER=admin
```

`SERVER_URL` is injected into the client snippet at request time — browsers use it to know where to send errors. It must be the public URL of this server, with no trailing slash.

`TRUST_PROXY` configures Express's `trust proxy` setting for correct IP detection behind a reverse proxy. Set to `1` if there is one proxy in front of Faultsy (the typical case), or a higher number for deeper proxy chains. Omit it (or set to `false`) if Faultsy is exposed directly.

`RESULT_TOKEN` is the shared secret that uptime monitors must supply as `Authorization: Bearer <token>` when polling `/api/result/:hostname`. Set it to a long random string and keep it private.

`DASHBOARD_SESSION_SECRET` signs the session cookie. Generate a random value with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`DASHBOARD_PASSWORD_HASH` is a bcrypt hash of your dashboard password. Generate one with the Docker Safe option at [https://iankulin.github.io/crypt/](https://iankulin.github.io/crypt/).

**Important:** bcrypt hashes contain `$` characters. In `.env` files and Docker Compose env files, escape every `$` as `$$` (e.g. `$2b$10$...` becomes `$$2b$$10$$...`). Faultsy converts them back automatically at startup.

`DASHBOARD_USER` is the dashboard login username. Defaults to `admin` if not set.

### 2. Create the whitelist

Create `data/whitelist.json` before starting the server for the first time. This seeds the initial set of domains that are allowed to register and submit errors:

```json
["example.com", "otherwebsite.com"]
```

The `data/` directory sits next to `docker-compose.yaml`. The database file (`faultsy.db`) is also stored there and is persisted via a Docker volume.

Once the server has started, the whitelist is stored in the database and can be managed from the dashboard at `/whitelist`. You can add or remove domains there without editing any files. The `data/whitelist.json` file is only read once, on first startup, when the database whitelist is empty.

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

Set up one **HTTP(s)** monitor per site you want to track:

| Field | Value |
|---|---|
| Monitor Type | HTTP(s) |
| URL | `https://your-faultsy-server.com/api/result/example.com` |
| Expected Status Code | `200` (default) |

Then add a custom header so Faultsy accepts the request:

| Header | Value |
|---|---|
| `Authorization` | `Bearer a-long-random-secret` |

eg:
```json
{
    "Authorization": "Bearer a-long-random-secret"
}
```

The value must match `RESULT_TOKEN` in your `.env`. The endpoint returns:

| Status | Meaning |
|---|---|
| `200` | No errors in the last 24 hours — monitor stays green |
| `503` | Errors recorded — Uptime Kuma marks the monitor as down and alerts you |
| `404` | Hostname not registered (site hasn't loaded `faultsy.js` yet) |
| `401` | Wrong or missing token |

## Notifications

Faultsy can send push notifications via [ntfy.sh](https://ntfy.sh) when errors are detected. Configure this from the **Notifications** page in the dashboard.

| Setting | Description |
|---|---|
| Enable notifications | Toggle ntfy.sh alerts on or off |
| Channel | Your ntfy.sh topic name (e.g. for `ntfy.sh/myalerts`, enter `myalerts`) |
| Cooldown | Minimum minutes between alerts per site. `0` = notify on every error. Max 10080 (1 week). |

A **Send test notification** button is available once a channel is configured. Notifications are sent fire-and-forget and do not block error ingestion.

## AI Disclosure

AI tools were used in the production of this software

## License

MIT