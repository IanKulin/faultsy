import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { requireAuth } from '../middleware/requireAuth.js';

describe('requireAuth', () => {
  test('calls next() when session is authenticated', () => {
    const req = { session: { authenticated: true } };
    const res = { redirect: () => { throw new Error('unexpected redirect'); } };
    let called = false;
    requireAuth(req, res, () => { called = true; });
    assert.ok(called);
  });

  test('redirects to /login when session is missing authenticated flag', () => {
    const req = { session: {} };
    let redirectedTo = null;
    const res = { redirect: (path) => { redirectedTo = path; } };
    requireAuth(req, res, () => { throw new Error('unexpected next()'); });
    assert.equal(redirectedTo, '/login');
  });

  test('redirects to /login when authenticated is explicitly false', () => {
    const req = { session: { authenticated: false } };
    let redirectedTo = null;
    const res = { redirect: (path) => { redirectedTo = path; } };
    requireAuth(req, res, () => { throw new Error('unexpected next()'); });
    assert.equal(redirectedTo, '/login');
  });

  test('redirects to /login when authenticated is null', () => {
    const req = { session: { authenticated: null } };
    let redirectedTo = null;
    const res = { redirect: (path) => { redirectedTo = path; } };
    requireAuth(req, res, () => { throw new Error('unexpected next()'); });
    assert.equal(redirectedTo, '/login');
  });
});
