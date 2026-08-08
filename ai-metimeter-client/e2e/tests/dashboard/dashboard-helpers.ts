import { Browser, Page, expect } from '@playwright/test';

export interface Step1Data {
  title: string;
  subject?: string;
  difficulty?: string;
  topic?: string;
  timeLimit?: number;
  questionsCount?: number;
}

/** Fills the "Configure & Generate" step (step 1) of /dashboard/create-assessment. */
export async function fillStep1(page: Page, data: Step1Data): Promise<void> {
  await page.locator('[data-testid="title-input"]').fill(data.title);

  if (data.subject) {
    await page.locator('[data-testid="subject-select"]').click();
    await page.getByRole('option', { name: data.subject, exact: true }).click();
  }

  if (data.difficulty) {
    await page.locator('[data-testid="difficulty-select"]').click();
    await page.getByRole('option', { name: data.difficulty, exact: true }).click();
  }

  if (data.topic) {
    await page.locator('[data-testid="topic-textarea"]').fill(data.topic);
  }

  if (data.timeLimit !== undefined) {
    await page.locator('[data-testid="time-limit-input"]').fill(String(data.timeLimit));
  }

  if (data.questionsCount !== undefined) {
    await page.locator('[data-testid="question-count-input"]').fill(String(data.questionsCount));
  }

  // Always generate a fresh 6-char access code so quizzes are joinable/published.
  await page.locator('[data-testid="access-code-refresh-btn"]').click();
}

export async function readAccessCode(page: Page): Promise<string> {
  return page.locator('[data-testid="access-code-input"]').inputValue();
}

/** Advances from step 1 to step 2 without invoking real question generation. */
export async function goToStep2(page: Page): Promise<void> {
  await page.locator('[data-testid="step-next-btn"]').click();
}

/** Advances from step 2 ("Review & Edit") to step 3 ("Preview & Publish"). Neither
 * the Back nor the "Next: Preview" button in step 2 carry a data-testid, so this
 * targets it by its accessible name. */
export async function goToStep3(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Next:\s*Preview/i }).click();
}

export interface ManualQuestionData {
  questionText: string;
  options: [string, string, string, string];
  correctOptionIndex: 0 | 1 | 2 | 3;
  explanation?: string;
}

/** Clicks "Add Manual Question" and fills in the newly-added question at `index`
 * (0-based, matching the order questions were added in). */
export async function addManualQuestion(
  page: Page,
  index: number,
  data: ManualQuestionData,
): Promise<void> {
  await page.locator('[data-testid="add-manual-question-btn"]').click();
  await page.locator(`[data-testid="question-text-${index}"]`).fill(data.questionText);

  for (let i = 0; i < 4; i++) {
    await page.locator(`[data-testid="option-input-${index}-${i}"]`).fill(data.options[i]);
  }

  await page.locator(`[data-testid="correct-radio-${index}-${data.correctOptionIndex}"]`).click();

  if (data.explanation) {
    await page.locator(`[data-testid="explanation-textarea-${index}"]`).fill(data.explanation);
  }
}

export interface CreatedQuiz {
  id: string;
  code: string;
  title: string;
  timeLimit: number;
}

/**
 * End-to-end helper: creates a quiz with a single manual question (no LLM call),
 * publishes it, and returns its real backend id (read off the my-quizzes card) plus
 * the access code, so callers can drive an attempt against it.
 */
export async function createPublishedQuizWithManualQuestion(
  page: Page,
  opts: { title: string; timeLimit?: number } = { title: 'E2E Quiz' },
): Promise<CreatedQuiz> {
  const timeLimit = opts.timeLimit ?? 15;

  await page.goto('/dashboard/create-assessment');
  await fillStep1(page, {
    title: opts.title,
    subject: 'Biology',
    difficulty: 'easy',
    topic: 'Photosynthesis basics',
    timeLimit,
  });
  const code = await readAccessCode(page);

  await goToStep2(page);
  await addManualQuestion(page, 0, {
    questionText: 'What do plants primarily use sunlight for?',
    options: ['Photosynthesis', 'Respiration', 'Digestion', 'Excretion'],
    correctOptionIndex: 0,
    explanation: 'Plants convert light energy into chemical energy via photosynthesis.',
  });

  await goToStep3(page);
  await page.locator('[data-testid="publish-btn"]').click();

  await page.waitForURL('**/dashboard/my-quizzes', { timeout: 15_000 });
  const card = page.locator('[data-testid^="quiz-card-"]').filter({ hasText: opts.title });
  await expect(card).toBeVisible({ timeout: 15_000 });
  const testId = await card.getAttribute('data-testid');
  const id = testId!.replace('quiz-card-', '');

  return { id, code, title: opts.title, timeLimit };
}

/**
 * Drives a full, real student attempt (join -> answer the single question -> submit)
 * against a quiz created via createPublishedQuizWithManualQuestion, using a fresh
 * unauthenticated browser context (students are never logged in). Used so
 * report-related specs can produce real attempt data without depending on the
 * separate student attempt-flow spec file's execution order.
 */
export async function submitSingleQuestionAttempt(
  browser: Browser,
  baseURL: string,
  quiz: CreatedQuiz,
  participantName = `E2E Student ${Date.now()}`,
): Promise<void> {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  try {
    await page.goto(`/attempt/${quiz.id}`);
    await page.locator('#participantName').fill(participantName);
    await page.locator('#accessCode').fill(quiz.code);
    await page.locator('[data-testid="join-btn"]').click();

    await page.locator('[data-testid="option-card-0"]').click();
    await page.locator('[data-testid="submit-btn"]').click();
    // Generous timeout: submit writes go over the network to a remote Supabase
    // Postgres pooler, which occasionally spikes under concurrent test load.
    await expect(page.locator('[data-testid="back-home-btn"]')).toBeVisible({ timeout: 20_000 });
  } finally {
    await context.close();
  }
}
