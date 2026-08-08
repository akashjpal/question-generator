import { test, expect } from '@playwright/test';

test.describe('Dashboard layout', () => {
  test.use({ storageState: 'e2e/.auth/teacher.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard/my-quizzes');
  });

  test('sidenav links navigate to the correct dashboard pages', async ({ page }) => {
    await page.locator('[data-testid="nav-reports"]').click();
    await expect(page).toHaveURL(/\/dashboard\/reports$/);

    await page.locator('[data-testid="nav-settings"]').click();
    await expect(page).toHaveURL(/\/dashboard\/settings$/);

    await page.locator('[data-testid="nav-my-quizzes"]').click();
    await expect(page).toHaveURL(/\/dashboard\/my-quizzes$/);
  });

  test('"New Assessment" navigates to the create-assessment page', async ({ page }) => {
    await page.locator('[data-testid="new-assessment-btn"]').click();
    await expect(page).toHaveURL(/\/dashboard\/create-assessment$/);
  });

  test('Agentic Mode toggle swaps the router-outlet for the chat UI and back', async ({ page }) => {
    const toggle = page.locator('[data-testid="agentic-mode-toggle"]');
    await expect(page.locator('[data-testid="chat-input"]')).not.toBeVisible();

    await toggle.click();
    await expect(page.locator('[data-testid="chat-input"]')).toBeVisible();
    // The routed page content (My Quizzes) should no longer be rendered.
    await expect(page.locator('[data-testid="filter-all"]')).not.toBeVisible();

    await toggle.click();
    await expect(page.locator('[data-testid="chat-input"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="filter-all"]')).toBeVisible();
  });

  test('sidenav collapses into an overlay drawer on a handset viewport @responsive', async ({ page }) => {
    // The `chromium` project runs at a desktop viewport (1280x720 via devices['Desktop
    // Chrome']), which never satisfies Angular CDK's Breakpoints.Handset — only the
    // separate `mobile-chrome` project's device emulation does. Resize explicitly so
    // this test is deterministic on both projects rather than only passing by accident
    // on mobile-chrome.
    await page.setViewportSize({ width: 375, height: 667 });

    // Angular CDK's BreakpointObserver(Breakpoints.Handset) drives isHandset$, which
    // switches the sidenav mode from 'side' to 'over' and reveals the menu-toggle button.
    await expect(page.locator('.menu-toggle')).toBeVisible();
    await expect(page.locator('mat-sidenav')).not.toHaveAttribute('mode', 'side');
  });
});
