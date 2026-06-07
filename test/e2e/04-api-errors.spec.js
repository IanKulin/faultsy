import { test, expect } from '@playwright/test';

test.beforeAll(async ({ request }) => {
  // Ensure example.com is registered (idempotent upsert)
  await request.get('/faultsy.js', {
    headers: { Referer: 'https://example.com/' },
  });
});

test('OPTIONS /api/errors returns 204 with CORS headers', async ({ request }) => {
  const res = await request.fetch('/api/errors', { method: 'OPTIONS' });
  expect(res.status()).toBe(204);
  expect(res.headers()['access-control-allow-origin']).toBe('*');
  expect(res.headers()['access-control-allow-methods']).toContain('POST');
});

test('POST /api/errors from registered whitelisted origin returns 204', async ({ request }) => {
  const res = await request.post('/api/errors', {
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://example.com',
    },
    data: { message: 'Test error', url: 'https://example.com/page' },
  });
  expect(res.status()).toBe(204);
});

test('POST /api/errors from unknown origin returns 403', async ({ request }) => {
  const res = await request.post('/api/errors', {
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://unknown.com',
    },
    data: { message: 'Test error', url: 'https://unknown.com/page' },
  });
  expect(res.status()).toBe(403);
});

test('POST /api/errors with missing message returns 400', async ({ request }) => {
  const res = await request.post('/api/errors', {
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://example.com',
    },
    data: { url: 'https://example.com/page' },
  });
  expect(res.status()).toBe(400);
});

test('POST /api/errors with invalid url returns 400', async ({ request }) => {
  const res = await request.post('/api/errors', {
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://example.com',
    },
    data: { message: 'Test error', url: 'not-a-url' },
  });
  expect(res.status()).toBe(400);
});
