import { expect, test } from '@playwright/test';
import { resetDB } from './playwright-helpers.js';

test.beforeEach(async ({ page }) => {
  await resetDB(page);
});

test('created month and expense survive a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Available this month').fill('1000');
  await page.getByRole('button', { name: 'Create month' }).click();
  await page.locator('.period-card').first().getByRole('button', { name: '+ Add' }).click();
  await page.getByLabel('Amount', { exact: true }).fill('40');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#statusCard .hero')).toContainText('$960.00');

  await page.reload();
  await expect(page.locator('#statusCard .hero')).toContainText('$960.00');
});
