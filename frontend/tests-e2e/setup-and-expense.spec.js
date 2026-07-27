import { expect, test } from '@playwright/test';
import { resetDB } from './playwright-helpers.js';

test.beforeEach(async ({ page }) => {
  await resetDB(page);
});

test('first run: set up a month, then record an expense', async ({ page }) => {
  await page.goto('/');

  // First run greets the user and points to the import escape hatch.
  await expect(page.locator('#monthSetupIntro')).toBeVisible();
  await expect(page.locator('#monthSetupIntro')).toContainText('import a backup');

  // Setup dialog appears with no data.
  await page.getByLabel('Available this month').fill('3000');
  await page.getByRole('button', { name: 'Create month' }).click();

  // Month screen renders.
  await expect(page.locator('#statusCard .hero')).toContainText('$3,000.00 available');
  await expect(page.locator('.period-card').first()).toBeVisible();

  // A fresh month has no bills yet: no bill-progress line, and the toggle invites adding one.
  await expect(page.locator('#statusCard')).not.toContainText('Bills:');
  await expect(page.locator('#statusCard')).toContainText('Add a bill');

  // Record an expense on the first period.
  await page.locator('.period-card').first().getByRole('button', { name: '+ Add' }).click();
  await page.getByLabel('Amount', { exact: true }).fill('50');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.locator('#statusCard .hero')).toContainText('$2,950.00 available');
});
