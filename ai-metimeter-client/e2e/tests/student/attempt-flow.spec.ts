import { test, expect } from '@playwright/test';
import { seedPublishedQuiz, joinQuiz, randomCode, SeededQuiz } from './student-helpers';

/**
 * Covers the real, backend-integrated student flow at `/attempt/:id` (component
 * `AttemptScreen`). This route is public (no auth guard), so these tests run without
 * a storageState. A small manual-question quiz is published once via the real teacher
 * UI in `beforeAll` (see student-helpers.ts) so every test here joins a real quiz
 * against the real AttemptAPI/question-generator API.
 */
test.describe('Student attempt flow (/attempt/:id)', () => {
  let quiz: SeededQuiz;

  test.beforeAll(async ({ browser }) => {
    quiz = await seedPublishedQuiz(browser, {
      title: `E2E Attempt Quiz ${Date.now()}`,
      code: randomCode(),
      timeLimitMinutes: 1,
      questions: [
        {
          text: 'What is the powerhouse of the cell?',
          options: ['Nucleus', 'Mitochondria', 'Ribosome', 'Golgi apparatus'],
          correctIndex: 1,
        },
        {
          text: 'What gas do plants absorb from the atmosphere for photosynthesis?',
          options: ['Oxygen', 'Nitrogen', 'Carbon Dioxide', 'Hydrogen'],
          correctIndex: 2,
        },
      ],
    });
  });

  test('join button stays disabled until name and code are both filled', async ({ page }) => {
    await page.goto(`/attempt/${quiz.quizId}`);
    const joinBtn = page.getByTestId('join-btn');
    await expect(joinBtn).toBeDisabled();

    await page.locator('#participantName').fill('Ada Lovelace');
    await expect(joinBtn).toBeDisabled();

    await page.locator('#accessCode').fill(quiz.code);
    await expect(joinBtn).toBeEnabled();
  });

  test('assessment info chips show the real title, subject, question count, and time limit', async ({ page }) => {
    await page.goto(`/attempt/${quiz.quizId}`);
    const chips = page.locator('.assessment-info-chips');
    await expect(chips).toContainText(quiz.title);
    await expect(chips).toContainText(quiz.subject);
    await expect(chips).toContainText(`${quiz.questions.length} Questions`);
    await expect(chips).toContainText(`${quiz.timeLimitMinutes} min`);
  });

  test('wrong access code is rejected via an alert and does not enter the quiz', async ({ page }) => {
    await page.goto(`/attempt/${quiz.quizId}`);
    await page.locator('#participantName').fill('Wrong Coder');
    await page.locator('#accessCode').fill('000000');

    let dialogMessage = '';
    page.once('dialog', async (dialog) => {
      dialogMessage = dialog.message();
      await dialog.accept();
    });
    await page.getByTestId('join-btn').click();

    await expect.poll(() => dialogMessage).toContain('Invalid Access Code');
    await expect(page.getByTestId('join-btn')).toBeVisible();
  });

  test('correct name and code enters the quiz', async ({ page }) => {
    await joinQuiz(page, quiz, 'Entry Checker');
    await expect(page.getByTestId('option-card-0')).toBeVisible();
    await expect(page.getByTestId('nav-dot-0')).toHaveClass(/nav-current/);
  });

  test('selecting an option marks it selected, flips the nav dot, and updates progress', async ({ page }) => {
    await joinQuiz(page, quiz, 'Nav Tester');

    await expect(page.getByTestId('nav-dot-0')).not.toHaveClass(/nav-answered/);
    await expect(page.locator('.progress-count')).toHaveText('0 / 2');

    await page.getByTestId('option-card-1').click();
    await expect(page.getByTestId('option-card-1')).toHaveClass(/option-selected/);
    await expect(page.getByTestId('nav-dot-0')).toHaveClass(/nav-answered/);
    await expect(page.locator('.progress-count')).toHaveText('1 / 2');

    await expect(page.getByTestId('prev-btn')).toBeDisabled();
    await page.getByTestId('next-btn').click();
    await expect(page.getByTestId('nav-dot-1')).toHaveClass(/nav-current/);
    await expect(page.getByTestId('submit-btn')).toBeVisible();
    await expect(page.getByTestId('next-btn')).toHaveCount(0);

    await page.getByTestId('prev-btn').click();
    await expect(page.getByTestId('nav-dot-0')).toHaveClass(/nav-current/);

    await page.getByTestId('nav-dot-1').click();
    await expect(page.getByTestId('nav-dot-1')).toHaveClass(/nav-current/);
  });

  test('flag toggle marks the current nav dot as flagged and can be undone', async ({ page }) => {
    await joinQuiz(page, quiz, 'Flag Tester');
    await expect(page.getByTestId('nav-dot-0')).not.toHaveClass(/nav-flagged/);

    await page.getByTestId('flag-btn').click();
    await expect(page.getByTestId('nav-dot-0')).toHaveClass(/nav-flagged/);

    await page.getByTestId('flag-btn').click();
    await expect(page.getByTestId('nav-dot-0')).not.toHaveClass(/nav-flagged/);
  });

  test('submitting via the bottom Submit button reports the correct score', async ({ page }) => {
    await joinQuiz(page, quiz, 'Bottom Submitter');

    await page.getByTestId(`option-card-${quiz.questions[0].correctIndex}`).click();
    await page.getByTestId('next-btn').click();

    const wrongIndex = (quiz.questions[1].correctIndex + 1) % quiz.questions[1].options.length;
    await page.getByTestId(`option-card-${wrongIndex}`).click();
    await expect(page.getByTestId('submit-btn')).toBeVisible();
    await page.getByTestId('submit-btn').click();

    await expect(page.locator('.result-heading')).toBeVisible();
    await expect(page.locator('.score-num')).toHaveText('1');
    await expect(page.locator('.score-denom')).toContainText('2');
  });

  test('submitting via the sidebar Submit Assessment button works from any question and reports the correct score', async ({ page }) => {
    await joinQuiz(page, quiz, 'Sidebar Submitter');

    await page.getByTestId(`option-card-${quiz.questions[0].correctIndex}`).click();
    await page.getByTestId('nav-dot-1').click();
    await page.getByTestId(`option-card-${quiz.questions[1].correctIndex}`).click();

    // Sidebar submit is available regardless of which question is active.
    await page.getByTestId('submit-sidebar-btn').click();

    await expect(page.locator('.result-heading')).toBeVisible();
    await expect(page.locator('.score-num')).toHaveText('2');
    await expect(page.locator('.score-denom')).toContainText('2');
  });

  test('the countdown timer auto-submits when time runs out, without any manual submit', async ({ page }) => {
    await page.clock.install();
    await joinQuiz(page, quiz, 'Timeout Tester');

    await page.clock.fastForward((quiz.timeLimitMinutes * 60 + 5) * 1000);

    await expect(page.locator('.result-heading')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.score-num')).toHaveText('0');
  });

  test('rejoining the same assessment after submitting is blocked', async ({ page }) => {
    await joinQuiz(page, quiz, 'Repeat Joiner');
    await page.getByTestId(`option-card-${quiz.questions[0].correctIndex}`).click();
    await page.getByTestId('submit-sidebar-btn').click();
    await expect(page.locator('.result-heading')).toBeVisible();

    // Re-attempt blocking is keyed only by `participantUniqueCode_{assessmentId}` in
    // localStorage — it fires regardless of the name typed on the second attempt.
    await page.reload();
    await page.locator('#participantName').fill('Repeat Joiner Again');
    await page.locator('#accessCode').fill(quiz.code);

    let dialogMessage = '';
    page.once('dialog', async (dialog) => {
      dialogMessage = dialog.message();
      await dialog.accept();
    });
    await page.getByTestId('join-btn').click();

    await expect.poll(() => dialogMessage).toContain('already attempted');
  });

  test('an unknown assessment id leaves the screen stuck loading (no error handler is wired for a failed fetch)', async ({ page }) => {
    // `AttemptScreen.loadAssessment()` subscribes to `getAssessment(id)` with only a
    // `next` callback and no `error` callback, so a 404 for a nonexistent id never
    // flips `isLoading` to false — the error-card branch (`error && !isLoading`) is
    // consequently unreachable via a bad id. This documents that real, current gap
    // rather than asserting the error card that the code cannot actually produce here.
    await page.goto('/attempt/999999999');
    await page.waitForTimeout(3000);
    await expect(page.locator('.loader-text')).toBeVisible();
    await expect(page.getByTestId('go-home-btn')).toHaveCount(0);
  });
});
