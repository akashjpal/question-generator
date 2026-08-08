import { test, expect } from '@playwright/test';

test.describe('Agentic Mode chat', () => {
  test.use({ storageState: 'e2e/.auth/teacher.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard/my-quizzes');
    await page.locator('[data-testid="agentic-mode-toggle"]').click();
    await expect(page.locator('[data-testid="chat-input"]')).toBeVisible();
  });

  test('enabling Agentic Mode renders the composer and an empty message list', async ({ page }) => {
    await expect(page.locator('[data-testid="chat-send-btn"]')).toBeVisible();
    await expect(page.locator('.message-list .empty-state')).toBeVisible();
  });

  test('sending a prompt produces an assistant response', async ({ page }) => {
    test.setTimeout(120_000);

    await page.locator('[data-testid="chat-input"]').fill('What can you help me do here?');
    await page.locator('[data-testid="chat-send-btn"]').click();

    // Message 0 is the user's own bubble; message 1 is the assistant's reply.
    await expect(page.locator('[data-testid="chat-message-0"]')).toContainText(
      'What can you help me do here?',
    );
    await expect(page.locator('[data-testid="chat-message-1"] .bubble-text')).not.toHaveText('', {
      timeout: 100_000,
    });
  });

  test('a quiz-creation prompt eventually renders a published-quiz-card', async ({ page }) => {
    test.setTimeout(120_000);

    // The agent only calls its create/publish tool once a source PDF is attached —
    // without one it just asks the user to upload one (verified by hitting the
    // agent-api directly). Attach the same fixture the PDF-based generation specs use.
    await page.locator('input[type="file"]').setInputFiles('e2e/fixtures/sample-lesson.pdf');
    await expect(page.locator('.attached-chip')).toBeVisible({ timeout: 15_000 });

    // Subject must be included up front — without it the agent asks a clarifying
    // question instead of calling its create/publish tool, which this single-shot
    // send-and-wait test isn't set up to answer.
    await page.locator('[data-testid="chat-input"]').fill(
      'Create and publish a 1 question easy quiz about photosynthesis, subject Biology, 10 minute time limit.',
    );
    await page.locator('[data-testid="chat-send-btn"]').click();

    await expect(page.locator('[data-testid="published-quiz-card"]')).toBeVisible({
      timeout: 100_000,
    });
    await expect(page.locator('[data-testid="published-quiz-card"] .quiz-row .value.code')).not.toHaveText('');
  });

  test('disabling Agentic Mode restores the normal router-outlet', async ({ page }) => {
    await page.locator('[data-testid="agentic-mode-toggle"]').click();
    await expect(page.locator('[data-testid="chat-input"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="filter-all"]')).toBeVisible();
  });
});
