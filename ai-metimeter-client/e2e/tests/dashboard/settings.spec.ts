import { test, expect } from '@playwright/test';

test.describe('Settings', () => {
  test.use({ storageState: 'e2e/.auth/teacher.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard/settings');
  });

  test('section nav switches the active panel', async ({ page }) => {
    await expect(page.locator('.settings-section h2')).toHaveText('Profile');

    await page.locator('[data-testid="nav-preferences"]').click();
    await expect(page.locator('[data-testid="nav-preferences"]')).toHaveClass(/active/);
    await expect(page.locator('.settings-section h2')).toHaveText('Preferences');

    await page.locator('[data-testid="nav-notifications"]').click();
    await expect(page.locator('.settings-section h2')).toHaveText('Notifications');

    await page.locator('[data-testid="nav-security"]').click();
    await expect(page.locator('.settings-section h2')).toHaveText('Security');

    await page.locator('[data-testid="nav-profile"]').click();
    await expect(page.locator('.settings-section h2')).toHaveText('Profile');
  });

  test('Profile shows the logged-in teacher\'s read-only name/email', async ({ page }) => {
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeDisabled();
    const email = await emailInput.inputValue();
    expect(email).toMatch(/@/);

    const nameInput = page.locator('.form-group input[type="text"]').first();
    await expect(nameInput).toBeDisabled();
  });

  test('Dark Mode toggle actually changes the applied theme', async ({ page }) => {
    await page.locator('[data-testid="nav-preferences"]').click();
    const toggle = page.locator('[data-testid="dark-mode-toggle"] button[role="switch"]');
    const initiallyChecked = (await toggle.getAttribute('aria-checked')) === 'true';

    await toggle.click();
    const expectedClass = initiallyChecked ? 'light-theme' : 'dark-theme';
    await expect(page.locator('body')).toHaveClass(new RegExp(expectedClass));

    // Toggle back to leave no persistent side effect for other tests.
    await toggle.click();
    const revertedClass = initiallyChecked ? 'dark-theme' : 'light-theme';
    await expect(page.locator('body')).toHaveClass(new RegExp(revertedClass));
  });

  test('Notifications and Security controls are disabled placeholders', async ({ page }) => {
    await page.locator('[data-testid="nav-notifications"]').click();
    const notificationToggles = page.locator('.settings-section mat-slide-toggle button[role="switch"]');
    const count = await notificationToggles.count();
    for (let i = 0; i < count; i++) {
      await expect(notificationToggles.nth(i)).toBeDisabled();
    }

    await page.locator('[data-testid="nav-security"]').click();
    await expect(page.locator('input[type="password"]').first()).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Update Password' })).toBeDisabled();
  });
});
