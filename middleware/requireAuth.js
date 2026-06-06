export function requireAuth(req, res, next) {
  if (req.session.authenticated) return next();
  res.redirect('/login');
}
