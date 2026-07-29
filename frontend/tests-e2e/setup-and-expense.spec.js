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
  await expect(page.locator('#statusCard .hero')).toContainText('$3,000.00');
  await expect(page.locator('.period-card').first()).toBeVisible();

  // A fresh month has a clear empty state and a disclosure control with one job.
  await expect(page.locator('#statusCard')).not.toContainText('unpaid');
  await expect(page.locator('#statusCard')).toContainText('No bills added yet');
  await expect(page.getByRole('button', { name: 'Show bills' })).toBeVisible();

  // Record an expense on the first period.
  await page.locator('.period-card').first().getByRole('button', { name: 'Add expense' }).click();
  await page.getByLabel('Amount', { exact: true }).fill('50');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.locator('#statusCard .hero')).toContainText('$2,950.00');
});
