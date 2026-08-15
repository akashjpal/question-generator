import { chromium, type FullConfig } from '@playwright/test';
import path from 'path';
import fs from 'fs';

/**
 * Logs in once as the dedicated Supabase test teacher account via the real login form,
 * then persists the authenticated session so dashboard specs can reuse it via:
 *   test.use({ storageState: 'e2e/.auth/teacher.json' })
 *
 * Requires TEST_TEACHER_EMAIL / TEST_TEACHER_PASSWORD env vars (see .env.test.example).
 */
export default async function globalSetup(config: FullConfig) {
  const email = process.env.TEST_TEACHER_EMAIL;
  const password = process.env.TEST_TEACHER_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'TEST_TEACHER_EMAIL and TEST_TEACHER_PASSWORD must be set (see .env.test.example) ' +
        'to a real, dedicated Supabase teacher test account before running the e2e suite.',
    );
  }

  const baseURL = config.projects[0]?.use?.baseURL as string | undefined;
  const authDir = path.join(__dirname, '.auth');
  fs.mkdirSync(authDir, { recursive: true });
  const storageStatePath = path.join(authDir, 'teacher.json');

  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });

  await page.goto('/auth/login');
  await page.fill('#login-email', email);
  await page.fill('#login-password', password);
  await page.click('#login-submit-btn');
  await page.waitForURL('**/dashboard/**', { timeout: 30_000 });

  await page.context().storageState({ path: storageStatePath });
  await browser.close();
}
