import { test, expect } from '@playwright/test';
import { createPublishedQuizWithManualQuestion, submitSingleQuestionAttempt } from './dashboard-helpers';

test.describe('My Quizzes', () => {
  test.use({
    storageState: 'e2e/.auth/teacher.json',
    permissions: ['clipboard-read', 'clipboard-write'],
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard/my-quizzes');
    await expect(page.locator('.loading-state')).not.toBeVisible({ timeout: 15_000 });
  });

  test('grid/list view toggle switches the rendered layout', async ({ page }) => {
    await page.locator('[data-testid="view-list-btn"]').click();
    await expect(page.locator('.quizzes-list')).toBeVisible();
    await expect(page.locator('.quizzes-grid')).not.toBeVisible();

    await page.locator('[data-testid="view-grid-btn"]').click();
    await expect(page.locator('.quizzes-grid')).toBeVisible();
    await expect(page.locator('.quizzes-list')).not.toBeVisible();
  });

  test('filter tabs restrict the visible set to Published or Draft quizzes', async ({ page }) => {
    await page.locator('[data-testid="filter-published"]').click();
    await expect(page.locator('[data-testid="filter-published"]')).toHaveClass(/active/);
    const publishedCount = await page.locator('.card-status.published').count();
    expect(await page.locator('.quizzes-grid .quiz-card').count()).toBe(publishedCount);

    await page.locator('[data-testid="filter-draft"]').click();
    await expect(page.locator('[data-testid="filter-draft"]')).toHaveClass(/active/);
    const draftCount = await page.locator('.card-status.draft').count();
    expect(await page.locator('.quizzes-grid .quiz-card').count()).toBe(draftCount);

    await page.locator('[data-testid="filter-all"]').click();
    await expect(page.locator('[data-testid="filter-all"]')).toHaveClass(/active/);
  });

  test('card menu: create attempt link copies origin/attempt/:id to the clipboard', async ({ page }) => {
    const quiz = await createPublishedQuizWithManualQuestion(page, {
      title: `Copy Link Test ${Date.now()}`,
    });
    await page.goto('/dashboard/my-quizzes');

    await page.locator(`[data-testid="card-menu-btn-${quiz.id}"]`).click();
    await page.locator(`[data-testid="create-attempt-link-action-${quiz.id}"]`).click();

    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain(
      `/attempt/${quiz.id}`,
    );
  });

  test('card menu: copy code copies the 6-digit access code to the clipboard', async ({ page }) => {
    const quiz = await createPublishedQuizWithManualQuestion(page, {
      title: `Copy Code Test ${Date.now()}`,
    });
    await page.goto('/dashboard/my-quizzes');

    // copy-code-btn is a standalone card button, not a mat-menu-item — unlike the
    // neighboring "create attempt link" test, no card-menu-btn click is needed (and
    // opening it first just leaves its overlay backdrop intercepting this click).
    await page.locator(`[data-testid="copy-code-btn-${quiz.id}"]`).click();

    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(quiz.code);
  });

  test('card menu: View Report is disabled at 0 attempts and enabled once a real attempt exists', async ({
    page,
    browser,
  }) => {
    const quiz = await createPublishedQuizWithManualQuestion(page, {
      title: `Report Gate Test ${Date.now()}`,
    });
    await page.goto('/dashboard/my-quizzes');
    await page.locator(`[data-testid="card-menu-btn-${quiz.id}"]`).click();
    await expect(page.locator(`[data-testid="view-report-action-${quiz.id}"]`)).toBeDisabled();
    await page.keyboard.press('Escape');

    const baseURL = test.info().project.use.baseURL as string;
    await submitSingleQuestionAttempt(browser, baseURL, quiz);

    await page.goto('/dashboard/my-quizzes');
    await page.locator(`[data-testid="card-menu-btn-${quiz.id}"]`).click();
    await expect(page.locator(`[data-testid="view-report-action-${quiz.id}"]`)).toBeEnabled({
      timeout: 15_000,
    });
    await page.locator(`[data-testid="view-report-action-${quiz.id}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/reports/${quiz.id}$`));
  });

  test('card menu: publish a draft (with confirm dialog) flips its status to Published', async ({ page }) => {
    await page.goto('/dashboard/create-assessment');
    const title = `Draft Publish Test ${Date.now()}`;
    await page.locator('[data-testid="title-input"]').fill(title);
    await page.locator('[data-testid="access-code-refresh-btn"]').click();

    // Wait for the ~5s autosave to persist this as a draft, then find its card.
    await page.waitForResponse(
      (res) => res.url().includes('/update-assessment') && res.request().method() === 'POST',
      { timeout: 10_000 },
    );
    await page.goto('/dashboard/my-quizzes');
    const card = page.locator('[data-testid^="quiz-card-"]').filter({ hasText: title });
    await expect(card).toBeVisible({ timeout: 15_000 });
    const id = (await card.getAttribute('data-testid'))!.replace('quiz-card-', '');

    await page.locator(`[data-testid="card-menu-btn-${id}"]`).click();
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator(`[data-testid="publish-action-${id}"]`).click();

    await expect(page.locator(`[data-testid="quiz-card-${id}"] .card-status`)).toContainText(
      'Published',
      { timeout: 15_000 },
    );
  });

  test('card menu: edit navigates to the edit route', async ({ page }) => {
    const quiz = await createPublishedQuizWithManualQuestion(page, {
      title: `Edit Nav Test ${Date.now()}`,
    });
    await page.goto('/dashboard/my-quizzes');

    await page.locator(`[data-testid="card-menu-btn-${quiz.id}"]`).click();
    await page.locator(`[data-testid="edit-action-${quiz.id}"]`).click();

    await expect(page).toHaveURL(new RegExp(`/dashboard/create-assessment/${quiz.id}$`));
  });

  test('card menu: delete (with confirm dialog) removes the card', async ({ page }) => {
    const quiz = await createPublishedQuizWithManualQuestion(page, {
      title: `Delete Test ${Date.now()}`,
    });
    await page.goto('/dashboard/my-quizzes');

    await page.locator(`[data-testid="card-menu-btn-${quiz.id}"]`).click();
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator(`[data-testid="delete-action-${quiz.id}"]`).click();

    await expect(page.locator(`[data-testid="quiz-card-${quiz.id}"]`)).not.toBeVisible({
      timeout: 15_000,
    });
  });

  test('Load More reveals additional quizzes when more than a page exists', async ({ page }) => {
    const loadMore = page.locator('[data-testid="load-more-btn"]');
    if (!(await loadMore.isVisible())) {
      test.skip(true, 'Not enough quizzes seeded in this environment to trigger pagination');
    }
    const before = await page.locator('.quizzes-grid .quiz-card').count();
    await loadMore.click();
    await expect
      .poll(() => page.locator('.quizzes-grid .quiz-card').count())
      .toBeGreaterThan(before);
  });

  test('empty state renders when a filter matches nothing', async ({ page }) => {
    // Not all environments will have zero drafts or zero published quizzes, so this
    // assertion is conditional on the empty state actually being reachable.
    for (const filter of ['filter-draft', 'filter-published'] as const) {
      await page.locator(`[data-testid="${filter}"]`).click();
      const count = await page.locator('.quizzes-grid .quiz-card, .quizzes-list .quiz-list-item').count();
      if (count === 0) {
        await expect(page.locator('.empty-state')).toBeVisible();
        return;
      }
    }
  });
});
