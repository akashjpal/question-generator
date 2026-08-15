import { test, expect } from '@playwright/test';

test.describe('Reports', () => {
  test.use({ storageState: 'e2e/.auth/teacher.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard/reports');
    await expect(page.locator('.loading-overlay')).not.toBeVisible({ timeout: 15_000 });
  });

  test('stat cards render', async ({ page }) => {
    await expect(page.locator('[data-testid="stat-total"] .stat-value')).toBeVisible();
    await expect(page.locator('[data-testid="stat-participants"] .stat-value')).toBeVisible();
    await expect(page.locator('[data-testid="stat-avg"] .stat-value')).toBeVisible();
    await expect(page.locator('[data-testid="stat-completion"] .stat-value')).toBeVisible();
  });

  test('table sort toggles aria-sort on the Assessment column header', async ({ page }) => {
    const rowCount = await page.locator('table.reports-table tbody tr').count();
    test.skip(rowCount < 2, 'Sorting is only meaningfully observable with 2+ rows');

    const header = page.getByRole('columnheader', { name: 'Assessment' });
    await header.click();
    await expect(header).toHaveAttribute('aria-sort', 'ascending');
    await header.click();
    await expect(header).toHaveAttribute('aria-sort', 'descending');
  });

  test('paginator (page size 5) navigates to the next page when more than 5 rows exist', async ({ page }) => {
    const rowCount = await page.locator('table.reports-table tbody tr').count();
    test.skip(rowCount <= 5, 'Not enough rows in this environment to page past 5');

    const firstRowTitleBefore = await page
      .locator('table.reports-table tbody tr')
      .first()
      .locator('.assessment-title')
      .textContent();

    await page.getByRole('button', { name: 'Next page' }).click();

    const firstRowTitleAfter = await page
      .locator('table.reports-table tbody tr')
      .first()
      .locator('.assessment-title')
      .textContent();
    expect(firstRowTitleAfter).not.toBe(firstRowTitleBefore);
  });

  test('Auto Refresh toggle triggers a periodic stats refetch', async ({ page }) => {
    const responsePromise = page.waitForResponse(
      (res) => res.url().includes('/api/dashboard/stats') && res.request().method() === 'GET',
      { timeout: 10_000 },
    );
    await page.locator('[data-testid="auto-refresh-toggle"] button[role="switch"]').click();
    await responsePromise;
  });

  test('"View Report" is disabled at 0 participants and enabled + navigable otherwise', async ({ page }) => {
    const disabledLink = page.locator('a.view-btn.disabled, button.view-btn.disabled').first();
    if (await disabledLink.count()) {
      await expect(disabledLink).toBeDisabled().catch(async () => {
        // Disabled <a> elements don't support toBeDisabled(); fall back to attribute check.
        await expect(disabledLink).toHaveAttribute('disabled', '');
      });
    }

    const enabledLink = page.locator('a.view-btn:not(.disabled)').first();
    if (await enabledLink.count()) {
      await enabledLink.click();
      await expect(page).toHaveURL(/\/dashboard\/reports\/.+/);
    }
  });

  test('"Export All Data" button is present (currently a non-functional placeholder)', async ({ page }) => {
    await expect(page.locator('[data-testid="export-all-btn"]')).toBeVisible();
  });
});
