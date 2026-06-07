import { test, expect } from '@playwright/test';

test('GET /faultsy.js returns application/javascript', async ({ request }) => {
  const res = await request.get('/faultsy.js');
  expect(res.ok()).toBeTruthy();
  expect(res.headers()['content-type']).toContain('application/javascript');
});

test('GET /faultsy.js with whitelisted Referer returns 200 and registers site', async ({ request }) => {
  const res = await request.get('/faultsy.js', {
    headers: { Referer: 'https://example.com/' },
  });
  expect(res.status()).toBe(200);
});

test('GET /faultsy.js with non-whitelisted Referer returns 403', async ({ request }) => {
  const res = await request.get('/faultsy.js', {
    headers: { Referer: 'https://notallowed.com/' },
  });
  expect(res.status()).toBe(403);
});
