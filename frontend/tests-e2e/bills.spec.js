import { expect, test } from '@playwright/test';
import { resetDB } from './playwright-helpers.js';

test.beforeEach(async ({ page }) => {
  await resetDB(page);
});

test('add a bill through the themed input sheet', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Available this month').fill('3000');
  await page.getByRole('button', { name: 'Create month' }).click();
  await expect(page.locator('#statusCard .hero')).toContainText('$3,000.00');

  // Expanding the section is distinct from adding a bill.
  await page.getByRole('button', { name: 'Show bills' }).click();
  await page.getByRole('button', { name: 'Add bill' }).click();
  await page.getByLabel('Bill name').fill('Rent');
  await page.getByLabel('Expected amount').fill('1200');
  await page.getByRole('dialog').getByRole('button', { name: 'Add bill', exact: true }).click();

  await expect(page.locator('#statusCard')).toContainText('0 of 1 bills paid');
  const row = page.locator('.bill-row');
  await expect(row).toContainText('Rent');
  await expect(row).toContainText('$1,200.00');
});

test('marking a bill paid captures its actual amount', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Available this month').fill('3000');
  await page.getByRole('button', { name: 'Create month' }).click();
  await page.getByRole('button', { name: 'Show bills' }).click();
  await page.getByRole('button', { name: 'Add bill' }).click();
  await page.getByLabel('Bill name').fill('Rent');
  await page.getByLabel('Expected amount').fill('1200');
  await page.getByRole('dialog').getByRole('button', { name: 'Add bill', exact: true }).click();

  await page.getByRole('button', { name: 'Mark Rent paid' }).click();
  await expect(page.getByLabel('Actual amount')).toHaveValue('1,200.00');
  await page.getByLabel('Actual amount').fill('1175.50');
  await page.getByRole('button', { name: 'Mark paid' }).click();

  const row = page.locator('.bill-row');
  await expect(row.getByRole('button', { name: 'Mark Rent unpaid' })).toBeVisible();
  await expect(row).toContainText('$1,175.50');
  await expect(row).toContainText('$1,200.00 expected');
  await expect(page.locator('#statusCard .hero')).toContainText('$1,824.50');
});

test('period details control stays put when its card expands', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Available this month').fill('3000');
  await page.getByRole('button', { name: 'Create month' }).click();

  const card = page.locator('.period-card').first();
  const toggle = card.getByRole('button', { name: 'Show details' });
  const add = card.getByRole('button', { name: 'Add expense' });
  await expect(card).not.toContainText('spent');
  await expect(card).not.toContainText('base');
  await expect(card).not.toContainText('left');
  const before = await toggle.boundingBox();
  const addBox = await add.boundingBox();
  expect(addBox?.y).toBeCloseTo(/** @type {NonNullable<typeof before>} */ (before).y, 0);
  await toggle.click();
  const after = await card.getByRole('button', { name: 'Hide details' }).boundingBox();

  await expect(card).toContainText('Spent');
  await expect(card).toContainText('Base allocation');
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(after?.x).toBeCloseTo(/** @type {NonNullable<typeof before>} */ (before).x, 0);
  expect(after?.y).toBeCloseTo(/** @type {NonNullable<typeof before>} */ (before).y, 0);

  await add.click();
  await page.getByLabel('Amount', { exact: true }).fill('1000');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(card.locator('.remaining')).toHaveText(/^-\$/);
  await expect(card).not.toContainText('over');
});
