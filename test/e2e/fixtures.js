import { test as base, expect } from '@playwright/test';

export { expect };

export const test = base.extend({
  authedPage: async ({ page }, use) => {
    await page.goto('/login');
    await page.fill('input[name="username"]', 'testuser');
    await page.fill('input[name="password"]', 'testpassword');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
    await use(page);
  },

  seededSite: async ({ request }, use) => {
    await use(async (hostname) => {
      await request.get('/faultsy.js', {
        headers: { Referer: `https://${hostname}/` },
      });
    });
  },

  seededError: async ({ request }, use) => {
    await use(async (hostname, message, url) => {
      await request.post('/api/errors', {
        headers: {
          'Content-Type': 'application/json',
          Origin: `https://${hostname}`,
        },
        data: { message, url },
      });
    });
  },
});
