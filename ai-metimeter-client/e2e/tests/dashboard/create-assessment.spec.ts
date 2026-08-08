import path from 'path';
import { test, expect } from '@playwright/test';
import {
  fillStep1,
  goToStep2,
  goToStep3,
  addManualQuestion,
  readAccessCode,
  createPublishedQuizWithManualQuestion,
} from './dashboard-helpers';

const SAMPLE_PDF = path.join(__dirname, '..', '..', 'fixtures', 'sample-lesson.pdf');

test.describe('Create Assessment', () => {
  test.use({ storageState: 'e2e/.auth/teacher.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard/create-assessment');
  });

  test.describe('Step 1: Configure & Generate — field behavior', () => {
    test('title, subject, difficulty, topic bind correctly', async ({ page }) => {
      await fillStep1(page, {
        title: 'World War II Overview',
        subject: 'History',
        difficulty: 'hard',
        topic: 'Causes and key events of WWII',
      });

      await expect(page.locator('[data-testid="title-input"]')).toHaveValue('World War II Overview');
      await expect(page.locator('[data-testid="subject-select"]')).toContainText('History');
      await expect(page.locator('[data-testid="difficulty-select"]')).toContainText('hard');
      await expect(page.locator('[data-testid="topic-textarea"]')).toHaveValue('Causes and key events of WWII');
    });

    test('time limit and question count declare their max via HTML attributes', async ({ page }) => {
      await expect(page.locator('[data-testid="time-limit-input"]')).toHaveAttribute('max', '30');
      await expect(page.locator('[data-testid="question-count-input"]')).toHaveAttribute('max', '10');
    });

    test('access code refresh button regenerates a 6-character code, input enforces maxlength', async ({ page }) => {
      const codeInput = page.locator('[data-testid="access-code-input"]');
      await page.locator('[data-testid="access-code-refresh-btn"]').click();
      const first = await codeInput.inputValue();
      expect(first).toHaveLength(6);

      await page.locator('[data-testid="access-code-refresh-btn"]').click();
      const second = await codeInput.inputValue();
      expect(second).toHaveLength(6);
      expect(second).not.toBe(first);

      await codeInput.fill('ABCDEFGHIJ');
      await expect(codeInput).toHaveValue(/^.{1,6}$/);
    });

    test('non-PDF file is rejected with a file-error message', async ({ page }) => {
      await page.setInputFiles('[data-testid="pdf-file-input"]', {
        name: 'notes.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('just some plain text notes'),
      });

      await expect(page.locator('[data-testid="file-error"]')).toHaveText('Only PDF files are allowed.');
      await expect(page.locator('[data-testid="pdf-upload-box"]')).toBeVisible();
    });

    test('oversized PDF (>5MB) is rejected with a file-error message', async ({ page }) => {
      const oversized = Buffer.alloc(6 * 1024 * 1024, 'a');
      await page.setInputFiles('[data-testid="pdf-file-input"]', {
        name: 'huge-lesson.pdf',
        mimeType: 'application/pdf',
        buffer: oversized,
      });

      await expect(page.locator('[data-testid="file-error"]')).toHaveText('File size must be less than 5MB.');
    });

    test('valid PDF is accepted, shows a preview, and can be removed', async ({ page }) => {
      await page.setInputFiles('[data-testid="pdf-file-input"]', SAMPLE_PDF);

      await expect(page.locator('[data-testid="pdf-upload-box"]')).not.toBeVisible();
      await expect(page.locator('.file-preview .name')).toHaveText('sample-lesson.pdf');
      await expect(page.locator('[data-testid="file-error"]')).not.toBeVisible();

      await page.locator('[data-testid="file-remove-btn"]').click();
      await expect(page.locator('[data-testid="pdf-upload-box"]')).toBeVisible();
    });
  });

  test.describe('Step 2 & 3: manual-question flow (no LLM calls)', () => {
    test('add, edit, and delete a manual question; preview reflects edits', async ({ page }) => {
      await fillStep1(page, {
        title: 'Photosynthesis Basics',
        subject: 'Biology',
        difficulty: 'easy',
        topic: 'How plants make energy from light',
        timeLimit: 10,
      });
      await goToStep2(page);

      // Add a throwaway question purely to exercise deletion.
      await addManualQuestion(page, 0, {
        questionText: 'Throwaway question',
        options: ['a', 'b', 'c', 'd'],
        correctOptionIndex: 0,
      });
      await expect(page.locator('[data-testid="question-panel-0"]')).toBeVisible();
      await page.locator('[data-testid="delete-question-btn-0"]').click();
      await expect(page.locator('[data-testid="question-panel-0"]')).not.toBeVisible();

      // Add the real question we'll carry through to preview/publish.
      await addManualQuestion(page, 0, {
        questionText: 'What pigment absorbs light for photosynthesis?',
        options: ['Chlorophyll', 'Melanin', 'Keratin', 'Hemoglobin'],
        correctOptionIndex: 0,
        explanation: 'Chlorophyll is the primary pigment used in photosynthesis.',
      });

      await expect(page.locator('[data-testid="question-text-0"]')).toHaveValue(
        'What pigment absorbs light for photosynthesis?',
      );
      await expect(page.locator('[data-testid="correct-radio-0-0"]')).toBeChecked();

      await goToStep3(page);
      await expect(page.locator('.preview-item').first()).toContainText(
        'What pigment absorbs light for photosynthesis?',
      );
      await expect(page.locator('.preview-item .option.correct').first()).toHaveText(/Chlorophyll/);
    });

    test('publishing navigates to My Quizzes and the quiz appears as Published', async ({ page, browserName }, testInfo) => {
      const title = `Publish Test ${testInfo.workerIndex}-${Date.now()}`;
      await fillStep1(page, {
        title,
        subject: 'Biology',
        difficulty: 'easy',
        topic: 'Photosynthesis basics',
        timeLimit: 12,
      });
      const code = await readAccessCode(page);
      expect(code).toHaveLength(6);

      await goToStep2(page);
      await addManualQuestion(page, 0, {
        questionText: 'What gas do plants absorb for photosynthesis?',
        options: ['Carbon dioxide', 'Nitrogen', 'Oxygen', 'Hydrogen'],
        correctOptionIndex: 0,
      });

      await goToStep3(page);
      await page.locator('[data-testid="publish-btn"]').click();

      await page.waitForURL('**/dashboard/my-quizzes');
      const card = page.locator('[data-testid^="quiz-card-"]').filter({ hasText: title });
      await expect(card).toBeVisible({ timeout: 15_000 });
      await expect(card.locator('.card-status')).toContainText('Published');
    });
  });

  test.describe('Edit mode', () => {
    test('PDF upload is disabled, existing data is pre-filled, and Update persists changes', async ({ page }) => {
      const quiz = await createPublishedQuizWithManualQuestion(page, { title: `Edit Test ${Date.now()}` });

      await page.goto(`/dashboard/create-assessment/${quiz.id}`);
      await expect(page.locator('[data-testid="title-input"]')).toHaveValue(quiz.title);
      await expect(page.locator('[data-testid="pdf-upload-box"]')).toHaveClass(/disabled/);
      await expect(page.locator('[data-testid="pdf-upload-box"] .text')).toHaveText('Upload disabled in edit mode');

      const updatedTitle = `${quiz.title} (Updated)`;
      await page.locator('[data-testid="title-input"]').fill(updatedTitle);

      // In edit mode, Step 2 ("Review & Edit") is removed from the stepper entirely,
      // so the Step 1 "Next" button advances straight to Step 3 ("Preview & Publish").
      await page.locator('[data-testid="step-next-btn"]').click();
      const publishBtn = page.locator('[data-testid="publish-btn"]');
      await expect(publishBtn).toContainText('Update Assessment');
      await publishBtn.click();

      await page.waitForURL('**/dashboard/my-quizzes');
      await expect(
        page.locator('[data-testid^="quiz-card-"]').filter({ hasText: updatedTitle }),
      ).toBeVisible({ timeout: 15_000 });
    });
  });

  test.describe('Autosave', () => {
    test('a draft POST fires roughly 5s after the title is set', async ({ page }) => {
      const responsePromise = page.waitForResponse(
        (res) => res.url().includes('/update-assessment') && res.request().method() === 'POST',
        { timeout: 10_000 },
      );
      await page.locator('[data-testid="title-input"]').fill(`Autosave Draft ${Date.now()}`);
      await responsePromise;
    });
  });

  test.describe('Real question generation (LLM-backed, slow)', () => {
    test('uploading a PDF and generating produces real questions in Step 2', async ({ page }) => {
      test.setTimeout(120_000);

      await fillStep1(page, {
        title: `Generated Quiz ${Date.now()}`,
        subject: 'Biology',
        difficulty: 'easy',
        topic: 'Photosynthesis',
        timeLimit: 10,
        questionsCount: 3,
      });

      await page.setInputFiles('[data-testid="pdf-file-input"]', SAMPLE_PDF);
      await expect(page.locator('[data-testid="pdf-upload-box"]')).not.toBeVisible();

      await page.locator('[data-testid="generate-questions-btn"]').click();

      await expect(page.locator('[data-testid="question-panel-0"]')).toBeVisible({ timeout: 100_000 });
      await expect(page.locator('[data-testid="question-text-0"]')).not.toHaveValue('');
    });
  });
});
