import { test, expect } from '@playwright/test';

const TOKEN = 'test-result-token';

test.beforeAll(async ({ request }) => {
  // Register result-test.com — starts clean with no errors
  await request.get('/faultsy.js', {
    headers: { Referer: 'https://result-test.com/' },
  });
});

test('GET /api/result/:hostname without token returns 401', async ({ request }) => {
  const res = await request.get('/api/result/example.com');
  expect(res.status()).toBe(401);
  expect(await res.json()).toMatchObject({ status: 'unauthorized' });
});

test('GET /api/result/:hostname for unknown site returns 404', async ({ request }) => {
  const res = await request.get('/api/result/unknown.com', {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  expect(res.status()).toBe(404);
  expect(await res.json()).toMatchObject({ status: 'unknown' });
});

test('GET /api/result/:hostname with no errors returns 200 ok', async ({ request }) => {
  const res = await request.get('/api/result/result-test.com', {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ status: 'ok' });
});

test('GET /api/result/:hostname with errors present returns 503', async ({ request }) => {
  await request.post('/api/errors', {
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://result-test.com',
    },
    data: { message: 'Result test error', url: 'https://result-test.com/page' },
  });

  const res = await request.get('/api/result/result-test.com', {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  expect(res.status()).toBe(503);
  expect(await res.json()).toMatchObject({ status: 'errors' });
});
