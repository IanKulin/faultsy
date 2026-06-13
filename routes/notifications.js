import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';

const CHANNEL_RE = /^[^/?]+$/;

export default function notificationsRouter({ dbGetSetting, dbSetSetting, csrf }) {
  const router = Router();

  router.get('/notifications', requireAuth, csrf, (req, res) => {
    res.render('notifications', {
      csrfToken: req.csrfToken(),
      ntfy_enabled: dbGetSetting('ntfy_enabled') === 'true',
      ntfy_channel: dbGetSetting('ntfy_channel') ?? '',
      ntfy_cooldown_minutes: dbGetSetting('ntfy_cooldown_minutes') ?? '15',
      saved: req.query.saved ?? null,
      tested: req.query.tested ?? null,
      error: req.query.error ?? null,
    });
  });

  router.post('/notifications/save', requireAuth, csrf, (req, res) => {
    const ntfy_enabled = req.body.ntfy_enabled === 'true' ? 'true' : 'false';
    const ntfy_channel = (req.body.ntfy_channel ?? '').trim();
    const ntfy_cooldown_minutes = req.body.ntfy_cooldown_minutes;

    if (ntfy_enabled === 'true' && !ntfy_channel) {
      return res.redirect('/notifications?error=missing_channel');
    }
    if (ntfy_channel && !CHANNEL_RE.test(ntfy_channel)) {
      return res.redirect('/notifications?error=invalid_channel');
    }
    const cooldown = parseInt(ntfy_cooldown_minutes, 10);
    if (!Number.isInteger(cooldown) || cooldown < 0 || cooldown > 10080) {
      return res.redirect('/notifications?error=invalid_cooldown');
    }

    dbSetSetting('ntfy_enabled', ntfy_enabled);
    dbSetSetting('ntfy_channel', ntfy_channel);
    dbSetSetting('ntfy_cooldown_minutes', String(cooldown));
    res.redirect('/notifications?saved=1');
  });

  router.post('/notifications/test', requireAuth, csrf, async (req, res) => {
    const channel = dbGetSetting('ntfy_channel');
    if (!channel) return res.redirect('/notifications?error=missing_channel');
    try {
      await fetch(`https://ntfy.sh/${channel}`, {
        method: 'POST',
        body: 'Faultsy error detected',
      });
      res.redirect('/notifications?tested=1');
    } catch (err) {
      res.redirect('/notifications?error=test_failed');
    }
  });

  return router;
}
