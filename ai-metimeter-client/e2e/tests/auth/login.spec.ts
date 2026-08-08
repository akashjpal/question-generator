import { test, expect } from '@playwright/test';

const TEACHER_EMAIL = process.env.TEST_TEACHER_EMAIL;
const TEACHER_PASSWORD = process.env.TEST_TEACHER_PASSWORD;

test.describe('Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/login');
  });

  test('shows validation errors for empty fields', async ({ page }) => {
    await page.locator('#login-email').click();
    await page.locator('#login-password').click(); // blurs email, marks it touched
    await page.locator('#login-submit-btn').click(); // blurs password, marks it touched

    await expect(page.getByText('Email is required')).toBeVisible();
    await expect(page.getByText('Password is required')).toBeVisible();
  });

  test('shows a validation error for an invalid email format', async ({ page }) => {
    await page.locator('#login-email').fill('not-an-email');
    await page.locator('#login-password').fill('irrelevant');
    await page.locator('#login-email').blur();

    await expect(page.getByText('Please enter a valid email')).toBeVisible();
  });

  test('wrong credentials surface the real backend error', async ({ page }) => {
    test.skip(!TEACHER_EMAIL, 'TEST_TEACHER_EMAIL is not set — see .env.test.example');

    await page.locator('#login-email').fill(TEACHER_EMAIL!);
    await page.locator('#login-password').fill('wrong-password-e2e-test');
    await page.locator('#login-submit-btn').click();

    await expect(page.locator('#login-error')).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/login$/);
  });

  test('correct credentials redirect to the dashboard', async ({ page }) => {
    test.skip(
      !TEACHER_EMAIL || !TEACHER_PASSWORD,
      'TEST_TEACHER_EMAIL/TEST_TEACHER_PASSWORD are not set — see .env.test.example'
    );

    await page.locator('#login-email').fill(TEACHER_EMAIL!);
    await page.locator('#login-password').fill(TEACHER_PASSWORD!);
    await page.locator('#login-submit-btn').click();

    await page.waitForURL(/\/dashboard/);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('the show/hide password toggle switches the input type', async ({ page }) => {
    const passwordInput = page.locator('#login-password');
    await passwordInput.fill('some-password');

    await expect(passwordInput).toHaveAttribute('type', 'password');
    await page.locator('#toggle-password-btn').click();
    await expect(passwordInput).toHaveAttribute('type', 'text');
    await page.locator('#toggle-password-btn').click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('"Forgot password?" navigates to the forgot-password page', async ({ page }) => {
    await page.locator('#forgot-password-link').click();
    await expect(page).toHaveURL(/\/auth\/forgot-password$/);
  });

  test('"Create one" navigates to the signup page', async ({ page }) => {
    await page.locator('#signup-link').click();
    await expect(page).toHaveURL(/\/auth\/signup$/);
  });

  test('the Google sign-in button redirects toward Google OAuth', async ({ page }) => {
    await page.locator('#google-login-btn').click();
    await page.waitForURL(/accounts\.google\.com/, { timeout: 15_000 });
    expect(page.url()).toContain('accounts.google.com');
  });
});
