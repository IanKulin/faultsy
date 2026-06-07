import { test, expect } from './fixtures.js';

test.beforeAll(async ({ request }) => {
  // Register dash-clean.com — used for the "no errors" site detail test
  await request.get('/faultsy.js', {
    headers: { Referer: 'https://dash-clean.com/' },
  });
});

test('GET / authenticated shows site row with hostname link', async ({ authedPage }) => {
  // example.com was seeded in 03-snippet.spec.js
  await expect(authedPage.locator('a[href="/site/example.com"]')).toBeVisible();
});

test('GET /site/:hostname shows error rows when errors present', async ({ authedPage }) => {
  // example.com has errors from 04-api-errors.spec.js
  await authedPage.goto('/site/example.com');
  await expect(authedPage.locator('table tbody tr').first()).toBeVisible();
});

test('GET /site/:hostname shows no errors message when site is clean', async ({ authedPage }) => {
  await authedPage.goto('/site/dash-clean.com');
  await expect(authedPage.getByText('No errors recorded in the last 48 hours.')).toBeVisible();
});

test('GET /site/:hostname returns 404 for unknown hostname', async ({ authedPage }) => {
  const res = await authedPage.goto('/site/unknown.com');
  expect(res?.status()).toBe(404);
});
