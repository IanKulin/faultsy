import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { layout, escHtml } from '../views/layout.js';

export default function dashboardRouter({ dbGetAllSitesSummary, dbGetSiteErrors, dbGetSite }) {
  const router = Router();

  router.get('/', requireAuth, async (req, res) => {
    const sites = dbGetAllSitesSummary();
    res.type('html').send(renderDashboard(sites));
  });

  router.get('/site/:hostname', requireAuth, (req, res) => {
    const { hostname } = req.params;
    const site = dbGetSite(hostname);
    if (!site) return res.status(404).type('text/plain').send('Not found');
    const errors = dbGetSiteErrors(hostname);
    res.type('html').send(renderSiteDetail(site, errors));
  });

  return router;
}

function renderDashboard(sites) {
  const rows = sites.map(s => {
    const lastErrorHtml = s.last_error_message
      ? `${escHtml(s.last_error_message.slice(0, 80))}${s.last_error_message.length > 80 ? '…' : ''}<br><small>${escHtml(formatTs(s.last_error_ts))}</small>`
      : '';
    return `<tr>
      <td><a href="/site/${escHtml(s.hostname)}">${escHtml(s.hostname)}</a></td>
      <td>${s.error_count}</td>
      <td>${lastErrorHtml}</td>
      <td>${escHtml(formatTs(s.last_seen))}</td>
      <td>${s.snippet_hits}</td>
    </tr>`;
  }).join('\n');

  const tableHtml = sites.length === 0
    ? '<p class="empty">No monitored sites yet.</p>'
    : `<table>
        <thead><tr><th>Site</th><th>Errors (48h)</th><th>Last Error</th><th>Last Access</th><th>Hits</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;

  return layout('Faultsy', `
    <div class="top-bar">
      <h1>Faultsy</h1>
      <form class="inline" method="POST" action="/logout">
        <button class="logout" type="submit">Logout</button>
      </form>
    </div>
    ${tableHtml}
  `);
}

function renderSiteDetail(site, errors) {
  const { hostname } = site;
  const rows = errors.map(e => `<tr>
    <td>${escHtml(formatTs(e.ts))}</td>
    <td class="truncate" title="${escHtml(e.message)}">${escHtml(e.message)}</td>
    <td class="truncate" title="${escHtml(e.url)}"><a href="${escHtml(e.url)}" target="_blank" rel="noopener noreferrer">${escHtml(e.url)}</a></td>
  </tr>`).join('\n');

  const tableHtml = errors.length === 0
    ? '<p class="empty">No errors recorded in the last 48 hours.</p>'
    : `<table>
        <thead><tr><th>Time</th><th>Message</th><th>URL</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;

  return layout(`${hostname} — Faultsy`, `
    <p class="breadcrumb"><a href="/">← Dashboard</a></p>
    <h1>${escHtml(hostname)}</h1>
    <p class="meta">Last seen: ${escHtml(formatTs(site.last_seen))} &nbsp;·&nbsp; Snippet hits: ${site.snippet_hits}</p>
    ${tableHtml}
  `);
}

function formatTs(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString();
}
