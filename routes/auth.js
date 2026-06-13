import { Router } from 'express';
import bcrypt from 'bcryptjs';

export default function authRouter({ DASHBOARD_USER, DASHBOARD_PASSWORD_HASH, csrf }) {
  const router = Router();

  router.get('/login', csrf, (req, res) => {
    if (req.session.authenticated) return res.redirect('/');
    req.session.csrfInit = true; // force session save so connect.sid is stable for CSRF binding
    res.render('login', { errorMsg: null, csrfToken: req.csrfToken() });
  });

  router.post('/login', csrf, async (req, res) => {
    const { username = '', password = '' } = req.body;
    const usernameMatch = username.toLowerCase() === DASHBOARD_USER.toLowerCase();
    const passwordMatch = await bcrypt.compare(password, DASHBOARD_PASSWORD_HASH);
    if (usernameMatch && passwordMatch) {
      req.session.regenerate((err) => {
        if (err) return res.status(500).type('text/plain').send('Internal server error');
        req.session.authenticated = true;
        res.redirect('/');
      });
      return;
    }
    res.render('login', { errorMsg: 'Invalid credentials', csrfToken: req.csrfToken() });
  });

  router.post('/logout', csrf, (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
  });

  return router;
}
