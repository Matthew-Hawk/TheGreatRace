import { test, expect } from '@playwright/test';
import { testEnv } from '../test/helpers.js';
import AxeBuilder from '@axe-core/playwright';

test('public pages and sign-in have no automated WCAG AA violations', async ({ page }) => {
  for (const path of ['/compare', '/races', '/methodology', '/editorial']) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    const violations = results.violations.map((issue) => ({
      rule: issue.id,
      examples: issue.nodes
        .slice(0, 4)
        .map((node) => ({ target: node.target, reason: node.failureSummary })),
    }));
    expect(violations, `Accessibility violations on ${path}`).toEqual([]);
  }
});

test('public comparison, search recovery, mobile layout, and human review workflow', async ({
  page,
}) => {
  const failures = [];
  page.on('pageerror', (error) => failures.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Know where they stand.' })).toBeVisible();
  await expect(page.getByText('No sourced statement recorded', { exact: true })).toHaveCount(32);
  await expect(page.getByRole('columnheader', { name: /Republican/ })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /Democratic/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/comparison-desktop.png', fullPage: false });
  await page.getByRole('button', { name: 'Healthcare', exact: true }).click();
  await expect(page.getByText('No sourced statement recorded', { exact: true })).toHaveCount(2);
  await page
    .getByRole('searchbox', { name: 'Search topics and statements' })
    .fill('no matching topic 994');
  await expect(page.getByRole('heading', { name: 'No matching topics' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByText('No sourced statement recorded', { exact: true })).toHaveCount(32);
  await expect(page.getByRole('searchbox')).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/comparison-mobile.png', fullPage: false });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.keyboard.press('Tab');
  await page.goto('/races');
  await page.getByRole('searchbox').fill('not a state');
  await expect(page.getByRole('heading', { name: 'No matching races' })).toBeVisible();
  await page.getByRole('searchbox').fill('Texas');
  await expect(page.getByRole('link', { name: /Explore this comparison/ })).toBeVisible();
  await page.goto('/methodology');
  await expect(page.getByRole('heading', { name: 'Independent human verification' })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/editorial');
  await page.getByLabel('Password', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText('Incorrect username');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('wrong-password');
  await page.getByLabel('Password', { exact: true }).fill(testEnv.RESEARCHER_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Editorial workspace.' })).toBeVisible();
  await page
    .getByLabel('Statement', { exact: true })
    .fill('EXAMPLE ONLY — fictional browser-test content.');
  await page.getByLabel('Source URL').fill('https://example.com/fictional-source');
  await page.getByLabel('Source title', { exact: true }).fill('EXAMPLE ONLY source');
  await page.getByRole('button', { name: 'Save as draft' }).click();
  await expect(page.getByText('Draft saved.', { exact: false })).toBeVisible();
  await page.goto('/compare');
  await expect(
    page.getByText('EXAMPLE ONLY — fictional browser-test content.', { exact: true }),
  ).toHaveCount(0);
  await page.goto('/editorial');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('combobox', { name: 'Username', exact: true }).selectOption('reviewer');
  await page.getByLabel('Password', { exact: true }).fill(testEnv.REVIEWER_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: 'Verify & publish' }).click();
  await expect(page.getByRole('alert')).toContainText('opened and read the source');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Verify & publish' }).click();
  await expect(page.getByText('Statement verified and published.', { exact: true })).toBeVisible();
  await page.goto('/compare');
  await expect(
    page.getByText('EXAMPLE ONLY — fictional browser-test content.', { exact: true }),
  ).toBeVisible();
  const source = page.getByRole('link', { name: /^Source / });
  await expect(source).toHaveAttribute('href', 'https://example.com/fictional-source');
  await expect(source).toHaveAttribute('target', '_blank');
  await page.getByRole('button', { name: 'Suggest a correction' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Suggest a correction' })).toBeFocused();
  await page.getByRole('button', { name: 'Suggest a correction' }).click();
  await page.getByLabel('What should we review?').fill('EXAMPLE ONLY — test correction.');
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByText('Thank you. Your correction is in the review queue.')).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.goto('/editorial');
  await expect(page.getByText('EXAMPLE ONLY — test correction.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mark resolved' }).click();
  await expect(page.getByText('Review task resolved.', { exact: true })).toBeVisible();
  expect(failures).toEqual([]);
});
