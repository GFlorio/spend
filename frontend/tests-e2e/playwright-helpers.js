/** Reset IndexedDB before each test via the app's test seam. @param {import('@playwright/test').Page} page */
export async function resetDB(page) {
  await page.goto('/');
  await page.evaluate(async () => {
    await /** @type {any} */ (window).__testDB.reset();
  });
  await page.reload();
}
