import { expect, test } from '@playwright/test';

import { annotationLabel } from '../../';

const LATENCY_SAMPLES_MS = [125, 275, 650];

test('has title', async ({ page }) => {
  await page.goto('https://playwright.dev/');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Playwright/);
});

test('get started link', async ({ page }) => {
  await page.goto('https://playwright.dev/');

  test.info().annotations.push({
    type: annotationLabel('foobar'),
    description: 'fizzbuzz',
  });

  // Click the get started link.
  await page.getByRole('link', { name: 'Get started' }).click();

  // Expects page to have a heading with the name of Installation.
  await expect(
    page.getByRole('heading', { name: 'Installation' })
  ).toBeVisible();
});

test.fail('looking for a non-existent link', async ({ page }) => {
  await page.goto('https://playwright.dev');

  await expect(page.getByRole('link', { name: 'Foobar' })).toBeVisible();
});

test.describe('retry examples', () => {
  test('flaky on first attempt', async ({ page }, testInfo) => {
    await page.goto('https://playwright.dev/');

    if (testInfo.retry === 0) {
      expect(testInfo.retry).toBe(1);
    }

    await expect(page).toHaveTitle(/Playwright/);
  });
});

test.describe.parallel('latency metric examples', () => {
  for (const latency of LATENCY_SAMPLES_MS) {
    test(`records ${latency}ms latency sample`, async ({ page }) => {
      await page.setContent('<main><h1>Latency metric sample</h1></main>');

      await test.step(`wait ${latency}ms`, async () => {
        await page.waitForTimeout(latency);
      });

      await expect(page.getByRole('heading')).toHaveText(
        'Latency metric sample'
      );
    });
  }
});

test.describe.parallel('parallel suite examples', () => {
  for (const workerName of ['alpha', 'bravo', 'charlie']) {
    test(`parallel worker ${workerName}`, async ({ page }) => {
      await page.setContent(`<button>${workerName}</button>`);

      await test.step(`parallel step ${workerName}`, async () => {
        await page.waitForTimeout(200);
        await page.getByRole('button', { name: workerName }).click();
      });

      await expect(
        page.getByRole('button', { name: workerName })
      ).toBeVisible();
    });
  }
});
