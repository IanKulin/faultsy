import { test, expect } from './fixtures.js';

test('GET / authenticated with no sites shows empty message', async ({ authedPage }) => {
  await expect(authedPage.getByText('No monitored sites yet.')).toBeVisible();
});
