import { test, expect } from '@playwright/test';

test.describe('Signup', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/signup');
  });

  test('shows validation errors for empty fields', async ({ page }) => {
    await page.locator('#signup-name').click();
    await page.locator('#signup-email').click(); // blurs name
    await page.locator('#signup-password').click(); // blurs email
    await page.locator('#signup-submit-btn').click(); // blurs password

    await expect(page.getByText('Name is required')).toBeVisible();
    await expect(page.getByText('Email is required')).toBeVisible();
    await expect(page.getByText('Password is required')).toBeVisible();
  });

  test('shows a validation error for an invalid email format', async ({ page }) => {
    await page.locator('#signup-email').fill('not-an-email');
    await page.locator('#signup-password').click(); // blur email
    await expect(page.getByText('Please enter a valid email')).toBeVisible();
  });

  test('reflects unmet password strength rules while typing a weak password', async ({ page }) => {
    await page.locator('#signup-password').fill('weak');

    const requirements = page.locator('.password-requirements .requirement');
    await expect(requirements).toHaveCount(4);
    await expect(page.locator('.password-requirements .requirement.met')).toHaveCount(0);
  });

  test('reflects all satisfied password strength rules for a strong password', async ({ page }) => {
    await page.locator('#signup-password').fill('Str0ng!Pass');

    await expect(page.locator('.password-requirements .requirement.met')).toHaveCount(4);
  });

  test('the Google sign-up button redirects toward Google OAuth', async ({ page }) => {
    await page.locator('#google-signup-btn').click();
    await page.waitForURL(/accounts\.google\.com/, { timeout: 15_000 });
    expect(page.url()).toContain('accounts.google.com');
  });

  test('successful signup redirects to the dashboard or shows the email-confirmation banner', async ({ page }) => {
    // Real Supabase project — no mocking. A freshly generated throwaway address is used
    // so this test can run repeatedly without colliding with an existing account.
    // mailinator.com is a real, deliverable inbox domain — Supabase's email validation
    // rejects reserved/placeholder domains like example.com as "invalid".
    const uniqueEmail = `e2e-signup-${Date.now()}@mailinator.com`;

    await page.locator('#signup-name').fill('E2E Test User');
    await page.locator('#signup-email').fill(uniqueEmail);
    await page.locator('#signup-password').fill('Str0ng!Pass123');
    await page.locator('#signup-submit-btn').click();

    // Either outcome is a valid, real backend response depending on whether the
    // Supabase project requires email confirmation — accept whichever occurs.
    await Promise.race([
      page.waitForURL(/\/dashboard/, { timeout: 20_000 }).catch(() => {}),
      page.locator('#signup-confirm-email').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {}),
      page.getByText('email rate limit exceeded').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {}),
    ]);

    // Supabase throttles confirmation emails per project (a handful per hour on the
    // free tier). Repeated e2e runs creating fresh throwaway accounts can legitimately
    // hit that external limit — the app correctly surfaces it via the error banner, so
    // treat it as an environment condition rather than a UI bug.
    const rateLimited = await page.getByText('email rate limit exceeded').isVisible().catch(() => false);
    test.skip(rateLimited, 'Supabase email rate limit exceeded for this project — not an app bug');

    const onDashboard = /\/dashboard/.test(page.url());
    const bannerVisible = await page.locator('#signup-confirm-email').isVisible().catch(() => false);
    expect(onDashboard || bannerVisible).toBeTruthy();
  });

  test('"Sign in" navigates to the login page', async ({ page }) => {
    await page.locator('#login-link').click();
    await expect(page).toHaveURL(/\/auth\/login$/);
  });
});
