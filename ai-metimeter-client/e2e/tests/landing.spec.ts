import { test, expect } from '@playwright/test';

// The navbar renders a desktop nav (.navbar-links / .navbar-actions) and a
// separate mobile menu (.mobile-menu) with duplicate link text at the same time
// in the DOM (visibility is CSS-only), so locators are scoped to the desktop
// nav to avoid Playwright strict-mode violations on duplicate matches.

test.describe('Landing page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('renders hero, features, pricing, testimonials, and how-it-works sections', async ({ page }) => {
    await expect(page.locator('.hero-section')).toBeVisible();
    await expect(page.locator('#features')).toBeAttached();
    await expect(page.locator('#pricing')).toBeAttached();
    await expect(page.locator('#how-it-works')).toBeAttached();
    await expect(page.locator('#testimonials')).toBeAttached();
  });

  test('nav links scroll to the matching section anchor', async ({ page }) => {
    const desktopNav = page.locator('.navbar-links');

    await desktopNav.getByRole('link', { name: 'Features' }).click();
    await expect(page).toHaveURL(/#features$/);

    await desktopNav.getByRole('link', { name: 'How it Works' }).click();
    await expect(page).toHaveURL(/#how-it-works$/);

    await desktopNav.getByRole('link', { name: 'Pricing' }).click();
    await expect(page).toHaveURL(/#pricing$/);

    await desktopNav.getByRole('link', { name: 'Reviews' }).click();
    await expect(page).toHaveURL(/#testimonials$/);
  });

  test('"Sign In" navigates to the login page', async ({ page }) => {
    await page.locator('.navbar-actions').getByRole('link', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/\/auth\/login$/);
  });

  test('"Get Started" nav CTA redirects unauthenticated users to login (guard)', async ({ page }) => {
    await page.locator('.navbar-actions').getByRole('link', { name: 'Get Started' }).click();
    await expect(page).toHaveURL(/\/auth\/login$/);
  });

  test('hero primary CTA redirects unauthenticated users to login (guard) @responsive', async ({ page }) => {
    await page.getByRole('link', { name: 'Get Started Free' }).click();
    await expect(page).toHaveURL(/\/auth\/login$/);
  });
});
