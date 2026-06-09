import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { layout, escHtml } from '../views/layout.js';

export default function authRouter({ DASHBOARD_USER, DASHBOARD_PASSWORD_HASH, csrf }) {
  const router = Router();

  router.get('/login', csrf, (req, res) => {
    if (req.session.authenticated) return res.redirect('/');
    req.session.csrfInit = true; // force session save so connect.sid is stable for CSRF binding
    res.type('html').send(renderLogin(null, req.csrfToken()));
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
    res.type('html').send(renderLogin('Invalid credentials', req.csrfToken()));
  });

  router.post('/logout', csrf, (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
  });

  return router;
}

function renderLogin(errorMsg, csrfToken) {
  const errorHtml = errorMsg
    ? `<p class="error-msg">${escHtml(errorMsg)}</p>`
    : '';
  return layout('Login — Faultsy', `
    <div class="login-wrap">
      <h1>Faultsy</h1>
      ${errorHtml}
      <form method="POST" action="/login">
        <input type="hidden" name="_csrf" value="${escHtml(csrfToken)}">
        <div class="field">
          <label for="username">Username</label>
          <input type="text" id="username" name="username" autocomplete="username" required>
        </div>
        <div class="field">
          <label for="password">Password</label>
          <input type="password" id="password" name="password" autocomplete="current-password" required>
        </div>
        <button class="btn" type="submit">Sign in</button>
      </form>
    </div>
  `);
}
