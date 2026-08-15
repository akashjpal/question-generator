import { test, expect } from '@playwright/test';

// Note: AuthService.forgotPassword() redirects to `/auth/reset-password` on the
// email link, but that route is never registered in auth.routes.ts (it falls
// through to the app's wildcard route). This is pre-existing app behavior this
// suite documents rather than treats as a failure.

test.describe('Forgot password', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/forgot-password');
  });

  test('shows a validation error for an empty email', async ({ page }) => {
    await page.locator('#forgot-email').click();
    await page.locator('#forgot-submit-btn').click(); // blurs email, marks it touched

    await expect(page.getByText('Email is required')).toBeVisible();
  });

  test('shows a validation error for an invalid email format', async ({ page }) => {
    await page.locator('#forgot-email').fill('not-an-email');
    await page.locator('#forgot-submit-btn').click();

    await expect(page.getByText('Please enter a valid email')).toBeVisible();
  });

  test('submitting a valid email shows the success state', async ({ page }) => {
    await page.locator('#forgot-email').fill('e2e-forgot-password-test@example.com');
    await page.locator('#forgot-submit-btn').click();

    await expect(page.locator('#email-sent-title')).toBeVisible();
    await expect(page.locator('#forgot-success')).toBeVisible();
  });

  test('the resend button is present and clickable after the success state', async ({ page }) => {
    await page.locator('#forgot-email').fill('e2e-forgot-password-test@example.com');
    await page.locator('#forgot-submit-btn').click();
    await expect(page.locator('#email-sent-title')).toBeVisible();

    await expect(page.locator('#resend-email-btn')).toBeVisible();
    await page.locator('#resend-email-btn').click();
    await expect(page.locator('#forgot-success')).toBeVisible();
  });

  test('"Back to Login" navigates to the login page', async ({ page }) => {
    await page.locator('#back-to-login-link').click();
    await expect(page).toHaveURL(/\/auth\/login$/);
  });
});
