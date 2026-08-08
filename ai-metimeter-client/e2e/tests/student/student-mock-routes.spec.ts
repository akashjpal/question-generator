import { test, expect } from '@playwright/test';

/**
 * `/student/*` (JoinQuiz, TakeQuiz, QuizResult) is intentionally-mocked, NOT
 * backend-integrated UI: `QuizService` (hitting `/api/quiz/*`) is defined but never
 * injected/used anywhere in the app, and these components render hardcoded static
 * data with zero HTTP calls. The real, backend-integrated student flow is
 * `/attempt/:id` — see attempt-flow.spec.ts. These tests are smoke-level only,
 * confirming the mock UI still navigates as coded; they are not testing any real
 * integration and should not be extended to expect backend behavior.
 * No storageState is needed — these routes carry no auth guard.
 */
test.describe('Student mock routes (dead UI, not backend-integrated)', () => {
  test('joining navigates from /student/join to /student/quiz/:code', async ({ page }) => {
    await page.goto('/student/join');

    await expect(page.getByRole('button', { name: 'Start Quiz' })).toBeDisabled();

    await page.locator('input[name="studentName"]').fill('Mock Student');
    await page.locator('input[name="quizCode"]').fill('123456');

    await expect(page.getByRole('button', { name: 'Start Quiz' })).toBeEnabled();
    await page.getByRole('button', { name: 'Start Quiz' }).click();

    await expect(page).toHaveURL(/\/student\/quiz\/123456$/);
  });

  test('/student/quiz/:id renders hardcoded mock questions and can be completed to reach the result screen', async ({ page }) => {
    await page.goto('/student/quiz/123456');

    await expect(page.locator('.question-text')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Previous' })).toBeDisabled();

    // 3 hardcoded questions (see TakeQuiz.questions) — answer through Next, then Submit.
    // Uses a fixed count + an auto-retrying `expect(...).toBeVisible()` rather than a
    // one-shot `isVisible()` poll: a single-shot check can read stale DOM mid-transition
    // (e.g. right as Next swaps for Submit on the last question), causing the loop to
    // either exit early or click a button that's about to detach — a classic Playwright
    // flakiness source. `totalQuestions` mirrors `TakeQuiz.questions.length`.
    const totalQuestions = 3;
    for (let i = 0; i < totalQuestions - 1; i++) {
      await page.locator('mat-radio-button.option-button').first().click();
      const nextBtn = page.getByRole('button', { name: 'Next' });
      await expect(nextBtn).toBeVisible();
      await nextBtn.click();
    }
    await page.locator('mat-radio-button.option-button').first().click();
    await page.getByRole('button', { name: 'Submit' }).click();

    await expect(page).toHaveURL(/\/student\/result$/);
  });

  test('/student/result shows the hardcoded score of 85', async ({ page }) => {
    await page.goto('/student/result');

    await expect(page.locator('.score-value')).toHaveText('85%');
    await expect(page.getByText('Congratulations!')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back to Home' })).toBeVisible();
  });
});
