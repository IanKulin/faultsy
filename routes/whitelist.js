import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';

const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;

export default function whitelistRouter({ dbGetWhitelist, dbAddToWhitelist, dbRemoveFromWhitelist, dbGetWhitelistCount, csrf }) {
  const router = Router();

  router.get('/whitelist', requireAuth, csrf, (req, res) => {
    const entries = dbGetWhitelist();
    res.render('whitelist', {
      entries,
      csrfToken: req.csrfToken(),
      added: req.query.added ?? null,
      removed: req.query.removed ?? null,
      error: req.query.error ?? null,
    });
  });

  router.post('/whitelist/add', requireAuth, csrf, (req, res) => {
    const hostname = (req.body.hostname ?? '').trim().toLowerCase();
    if (!hostname || !HOSTNAME_RE.test(hostname)) {
      return res.redirect('/whitelist?error=invalid');
    }
    dbAddToWhitelist(hostname);
    res.redirect(`/whitelist?added=${encodeURIComponent(hostname)}`);
  });

  router.post('/whitelist/delete', requireAuth, csrf, (req, res) => {
    const hostname = (req.body.hostname ?? '').trim();
    if (!hostname) {
      return res.redirect('/whitelist?error=invalid');
    }
    if (dbGetWhitelistCount() <= 1) {
      return res.redirect('/whitelist?error=last_entry');
    }
    dbRemoveFromWhitelist(hostname);
    res.redirect(`/whitelist?removed=${encodeURIComponent(hostname)}`);
  });

  return router;
}
