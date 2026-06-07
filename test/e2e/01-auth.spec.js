import { test, expect } from '@playwright/test';

test('GET /login renders login form', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('input[name="username"]')).toBeVisible();
  await expect(page.locator('input[name="password"]')).toBeVisible();
});

test('POST /login with wrong creds shows Invalid credentials', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name="username"]', 'testuser');
  await page.fill('input[name="password"]', 'wrongpassword');
  await page.click('button[type="submit"]');
  await expect(page.getByText('Invalid credentials')).toBeVisible();
});

test('POST /login with correct creds redirects to /', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name="username"]', 'testuser');
  await page.fill('input[name="password"]', 'testpassword');
  await page.click('button[type="submit"]');
  await page.waitForURL('/');
  expect(new URL(page.url()).pathname).toBe('/');
});

test('GET / unauthenticated redirects to /login', async ({ page }) => {
  await page.goto('/');
  await page.waitForURL(/\/login/);
  expect(page.url()).toContain('/login');
});

test('POST /logout destroys session and redirects to /login', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name="username"]', 'testuser');
  await page.fill('input[name="password"]', 'testpassword');
  await page.click('button[type="submit"]');
  await page.waitForURL('/');

  await page.click('button:text("Logout")');
  await page.waitForURL(/\/login/);

  await page.goto('/');
  await page.waitForURL(/\/login/);
});

test('GET /login while authenticated redirects to /', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name="username"]', 'testuser');
  await page.fill('input[name="password"]', 'testpassword');
  await page.click('button[type="submit"]');
  await page.waitForURL('/');

  await page.goto('/login');
  await page.waitForURL('/');
  expect(new URL(page.url()).pathname).toBe('/');
});
