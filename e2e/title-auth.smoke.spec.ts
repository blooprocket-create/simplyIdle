import { test, expect } from '@playwright/test';

test.describe('Title to Auth smoke', () => {
  test('user can enter campaign and reach auth form', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('BEGIN CAMPAIGN')).toBeVisible();
    await page.getByRole('button', { name: /begin campaign/i }).click();

    await expect(page.getByText('Online Command Access')).toBeVisible();
    await expect(page.getByText('SimplyIdle')).toBeVisible();

    await page.getByText('Create', { exact: true }).click();
    await expect(page.getByText('Open a New Ledger')).toBeVisible();

    await page.getByPlaceholder('commander@domain.com').fill('smoke@example.com');
    await page.getByPlaceholder('Enter password').fill('password123');
    await page.getByPlaceholder('Repeat password').fill('password123');

    const hasPublicUsernameField = await page.getByPlaceholder('your_username').last().isVisible();
    if (hasPublicUsernameField) {
      await page.getByPlaceholder('your_username').last().fill('smoke_runner_01');
      await expect(page.getByText('Public Username')).toBeVisible();
    } else {
      await expect(page.getByText('Online features are temporarily unavailable. Please try again later.').first()).toBeVisible();
    }

    await expect(page.getByText('Open a New Ledger')).toBeVisible();
  });
});
