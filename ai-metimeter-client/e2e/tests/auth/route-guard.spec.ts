import { test, expect } from '@playwright/test';

test.describe('Route guard — unauthenticated', () => {
  // No storageState is applied here (top-level config default), so these run as a
  // genuinely unauthenticated session.

  test('visiting /dashboard/my-quizzes without a session redirects to login', async ({ page }) => {
    await page.goto('/dashboard/my-quizzes');
    await expect(page).toHaveURL(/\/auth\/login$/);
  });

  test('visiting a nested dashboard child route without a session redirects to login', async ({ page }) => {
    await page.goto('/dashboard/create-assessment');
    await expect(page).toHaveURL(/\/auth\/login$/);
  });

  test('an unknown path redirects to the landing page', async ({ page }) => {
    await page.goto('/this-does-not-exist');
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe('Route guard — authenticated', () => {
  test.use({ storageState: 'e2e/.auth/teacher.json' });

  test('an authenticated session can reach the dashboard', async ({ page }) => {
    await page.goto('/dashboard/my-quizzes');
    await expect(page).toHaveURL(/\/dashboard\/my-quizzes$/);
    await expect(page).not.toHaveURL(/\/auth\/login/);
  });
});
