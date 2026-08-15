import { Browser, Page, expect } from '@playwright/test';

export interface SeededQuestion {
  text: string;
  options: [string, string, string, string];
  correctIndex: number;
}

export interface SeedQuizOptions {
  title: string;
  code: string;
  timeLimitMinutes: number;
  questions: SeededQuestion[];
}

export interface SeededQuiz {
  quizId: string;
  title: string;
  subject: string;
  code: string;
  timeLimitMinutes: number;
  questions: SeededQuestion[];
}

const SUBJECT = 'Biology';

export function randomCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Publishes a small manual-question quiz through the real teacher UI (login already
 * done via the shared `e2e/.auth/teacher.json` storageState) so the student-facing
 * `/attempt/:id` specs have a real, backend-created quiz + access code to join.
 * Uses "Add Manual Question" rather than "Generate Questions" to avoid a real LLM call.
 */
export async function seedPublishedQuiz(browser: Browser, opts: SeedQuizOptions): Promise<SeededQuiz> {
  const context = await browser.newContext({ storageState: 'e2e/.auth/teacher.json' });
  const page = await context.newPage();

  await page.goto('/dashboard/create-assessment');

  await page.getByTestId('title-input').fill(opts.title);

  await page.getByTestId('subject-select').click();
  await page.getByRole('option', { name: SUBJECT }).click();

  await page.getByTestId('time-limit-input').fill(String(opts.timeLimitMinutes));
  await page.getByTestId('access-code-input').fill(opts.code);

  // Advances to "Review & Edit" — this button calls stepper.next() directly and works.
  await page.getByTestId('step-next-btn').click();

  for (let i = 0; i < opts.questions.length; i++) {
    await page.getByTestId('add-manual-question-btn').click();
  }

  for (let i = 0; i < opts.questions.length; i++) {
    const q = opts.questions[i];
    await page.getByTestId(`question-text-${i}`).fill(q.text);
    for (let optIdx = 0; optIdx < q.options.length; optIdx++) {
      await page.getByTestId(`option-input-${i}-${optIdx}`).fill(q.options[optIdx]);
    }
    await page.getByTestId(`correct-radio-${i}-${q.correctIndex}`).click();
  }

  // create-assessment.html's step-2 "Next: Preview" button has a static
  // `disabled="isGenerating"` attribute (missing the `[disabled]` property binding
  // brackets), so it is permanently disabled — a real bug in the app, not a test issue.
  // The stepper is non-linear ([linear]="false"), so jump to the Preview step directly
  // via its tab header instead, which is a legitimate navigation path for real users too.
  await page.getByRole('tab', { name: /Preview & Publish/ }).click();

  await page.getByTestId('publish-btn').click();
  await page.waitForURL('**/dashboard/my-quizzes');

  const card = page.locator('[data-testid^="quiz-card-"]').filter({ hasText: opts.title });
  await expect(card).toBeVisible({ timeout: 15_000 });
  const testId = await card.getAttribute('data-testid');
  const quizId = testId!.replace('quiz-card-', '');

  await context.close();

  return {
    quizId,
    title: opts.title,
    subject: SUBJECT,
    code: opts.code,
    timeLimitMinutes: opts.timeLimitMinutes,
    questions: opts.questions,
  };
}

/** Navigates an unauthenticated page to the attempt join screen and joins as `participantName`. */
export async function joinQuiz(page: Page, quiz: SeededQuiz, participantName: string): Promise<void> {
  await page.goto(`/attempt/${quiz.quizId}`);
  await page.locator('#participantName').fill(participantName);
  await page.locator('#accessCode').fill(quiz.code);
  await page.getByTestId('join-btn').click();
  await expect(page.getByTestId('option-card-0')).toBeVisible();
}
