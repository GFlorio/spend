import { expect, test } from '@playwright/test';
import { resetDB } from './playwright-helpers.js';

test.beforeEach(async ({ page }) => {
  await resetDB(page);
});

test('fund a new envelope from a period and see it on the Envelopes screen', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Available this month').fill('3000');
  await page.getByRole('button', { name: 'Create month' }).click();
  await expect(page.locator('#statusCard .hero')).toContainText('$3,000.00 available');

  // Open the universal form from the first period, move money to a new envelope.
  await page.locator('.period-card').first().getByRole('button', { name: '+ Add' }).click();
  await page.getByLabel('Amount', { exact: true }).fill('100');

  // Create a new envelope as the destination via the themed name sheet.
  await page.locator('#activityDialog').getByLabel('To').selectOption('new-envelope');
  await page.getByLabel('Envelope name').fill('Travel');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('#activityTitle')).toContainText('Move money');
  await page.getByRole('button', { name: 'Save' }).click();

  // Switch to Envelopes and confirm the balance.
  await page.getByRole('button', { name: 'Envelopes' }).click();
  await expect(page.locator('#envelopeList')).toContainText('Travel');
  await expect(page.locator('#envelopeList')).toContainText('$100.00');
});

test('add a second funding source through the themed picker', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Available this month').fill('3000');
  await page.getByRole('button', { name: 'Create month' }).click();

  await page.locator('.period-card').first().getByRole('button', { name: '+ Add' }).click();
  await page.getByLabel('Amount', { exact: true }).fill('60');

  // Pick a second source from the themed list — no native prompt.
  await page.getByRole('button', { name: '+ Add source' }).click();
  await page.getByRole('button', { name: 'Whole month' }).click();
  await expect(page.locator('#activitySources .source-row')).toHaveCount(2);

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#statusCard .hero')).toContainText('$2,940.00 available');
});
