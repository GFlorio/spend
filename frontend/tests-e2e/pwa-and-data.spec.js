import { expect, test } from '@playwright/test';
import { resetDB } from './playwright-helpers.js';

test.beforeEach(async ({ page }) => {
  await resetDB(page);
});

test('export, reset, then re-import restores the dataset', async ({ page }) => {
  await page.goto('/');

  // Create a month.
  await page.getByLabel('Available this month').fill('3000');
  await page.getByRole('button', { name: 'Create month' }).click();
  await expect(page.locator('#statusCard .hero')).toContainText('$3,000.00 available');

  // Export a backup.
  await page.getByRole('button', { name: 'Settings' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export backup' }).click(),
  ]);
  expect(download.suggestedFilename()).toContain('spend-backup');
  const filePath = await download.path();

  // Reset wipes everything → confirm in the themed dialog → the setup dialog returns.
  await page.getByRole('button', { name: 'Reset all data' }).click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.getByLabel('Available this month')).toBeVisible();

  // Cancel setup so the nav is reachable, then re-import the backup.
  await page.locator('#monthSetupClose').click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.setInputFiles('#dataImportFile', filePath);
  // Confirm the replace in the themed dialog.
  await page.getByRole('button', { name: 'Replace', exact: true }).click();

  // Import reloads the app; the month is restored.
  await expect(page.locator('#statusCard .hero')).toContainText('$3,000.00 available');
});

test('the month selector marks a past month with open funds', async ({ page }) => {
  // Seed a clearly-past month (all periods completed) with an expense that leaves its
  // period positive — a completed period with activity is what surfaces open funds.
  await page.evaluate(async () => {
    const db = /** @type {any} */ (window).__testDB;
    await db.put('months', {
      id: 'month:2000-01', monthKey: '2000-01', available: 300000, createdAt: 1, updatedAt: 1,
    });
    await db.put('activities', {
      id: 'act:2000-01-seed', monthKey: '2000-01', periodIndex: 0,
      destination: { type: 'spent' },
      allocations: [{ source: { type: 'period', periodIndex: 0 }, amount: 1000 }],
      description: '', createdAt: 2, updatedAt: 2,
    });
  });
  await page.reload();

  await page.getByRole('button', { name: /January 2000/ }).click();
  await expect(page.locator('#monthList .attention-dot')).toBeVisible();
});
