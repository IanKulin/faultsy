import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';

export default function dashboardRouter({ dbGetAllSitesSummary, dbGetSiteErrors, dbGetSite, csrf }) {
  const router = Router();

  router.get('/', requireAuth, csrf, async (req, res) => {
    const sites = dbGetAllSitesSummary();
    res.render('dashboard', { sites, csrfToken: req.csrfToken() });
  });

  router.get('/site/:hostname', requireAuth, csrf, (req, res) => {
    const { hostname } = req.params;
    const site = dbGetSite(hostname);
    if (!site) return res.status(404).type('text/plain').send('Not found');
    const errors = dbGetSiteErrors(hostname);
    res.render('site', { site, errors });
  });

  return router;
}
