import { expect, test } from '@playwright/test';
import { resetDB } from './playwright-helpers.js';

test.beforeEach(async ({ page }) => {
  await resetDB(page);
});

test('add a bill through the themed input sheet', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Available this month').fill('3000');
  await page.getByRole('button', { name: 'Create month' }).click();
  await expect(page.locator('#statusCard .hero')).toContainText('$3,000.00 available');

  // Open the (empty) bill list, then add a bill via the themed sheet — no native prompt.
  await page.getByRole('button', { name: 'Add a bill' }).click();
  await page.getByRole('button', { name: '+ Add bill' }).click();
  await page.getByLabel('Bill name').fill('Rent');
  await page.getByLabel('Expected amount').fill('1200');
  await page.getByRole('button', { name: 'Add bill', exact: true }).click();

  await expect(page.locator('#statusCard')).toContainText('Bills: 0 of 1 paid');
  const row = page.locator('.bill-row');
  await expect(row).toContainText('Rent');
  await expect(row).toContainText('$1,200.00');
});
