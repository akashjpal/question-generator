import { test, expect } from '@playwright/test';
import { createPublishedQuizWithManualQuestion, submitSingleQuestionAttempt } from './dashboard-helpers';

test.describe('Assessment Report', () => {
  test.use({ storageState: 'e2e/.auth/teacher.json' });

  // Self-contained setup: rather than relying on the separate student attempt-flow
  // spec file (Playwright does not guarantee cross-file execution order), this suite
  // creates its own quiz and drives a real attempt against it via the shared helper.
  // beforeAll/beforeEach run in the same worker process for this file, so a plain
  // module-scoped variable is sufficient to hand the id across.
  let quizId: string;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'e2e/.auth/teacher.json' });
    const page = await context.newPage();
    const quiz = await createPublishedQuizWithManualQuestion(page, {
      title: `Assessment Report Fixture ${Date.now()}`,
    });
    const baseURL = test.info().project.use.baseURL as string;
    await submitSingleQuestionAttempt(browser, baseURL, quiz, 'Ada Lovelace');
    await context.close();
    quizId = quiz.id;
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(`/dashboard/reports/${quizId}`);
    await expect(page.locator('.loading-container')).not.toBeVisible({ timeout: 15_000 });
  });

  test('stat cards reflect the submitted attempt', async ({ page }) => {
    await expect(page.locator('[data-testid="stat-avg-score"] .stat-value')).toBeVisible();
    await expect(page.locator('[data-testid="stat-participants"] .stat-value')).toHaveText(/[1-9]\d*/);
    await expect(page.locator('[data-testid="stat-highest-score"] .stat-value')).toBeVisible();
    await expect(page.locator('[data-testid="stat-lowest-score"] .stat-value')).toBeVisible();
  });

  test('participant table renders a row for the submitted attempt', async ({ page }) => {
    await expect(page.locator('table.results-table tbody tr')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator('table.results-table .student-cell')).toContainText('Ada Lovelace');
  });

  test('Download PDF triggers a file download', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-testid="download-pdf-btn"]').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  });

  test('Export CSV triggers a file download', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-testid="export-csv-btn"]').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.csv$/i);
  });

  test('Auto Refresh toggle is present and togglable', async ({ page }) => {
    const toggle = page.locator('[data-testid="auto-refresh-toggle"] button[role="switch"]');
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  test('back link returns to Reports', async ({ page }) => {
    await page.locator('[data-testid="back-link"]').click();
    await expect(page).toHaveURL(/\/dashboard\/reports$/);
  });
});
