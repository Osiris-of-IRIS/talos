/**
 * E2E: bulk artifact selection — select multiple, download as a zip (skipping an invalid one with
 * a warning), delete multiple with confirmation. Follows the E2E convention in docs/testing.md.
 * Decision IDs: ADR-0001, ADR-0027 (feature IMPL-001).
 * Covers TEST-CDEF-03.
 */
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const noCreatorFixture = fileURLToPath(
  new URL('../data/component-definition-minimal.json', import.meta.url),
);
const withCreatorFixture = fileURLToPath(
  new URL('../data/component-definition-with-creator.json', import.meta.url),
);

test('select multiple component-definitions, download as a zip (one skipped for no creator), then delete the rest', async ({
  page,
}) => {
  await page.goto('/#/component-definitions');
  await page.getByTestId('compdef-upload-input').setInputFiles(noCreatorFixture);
  await page.getByTestId('compdef-upload-input').setInputFiles(withCreatorFixture);
  await expect(page.getByTestId('compdef-item')).toHaveCount(2);

  // Select all via the header checkbox.
  await page.getByTestId('compdef-select-all').check();
  await expect(page.getByTestId('compdef-selected-count')).toContainText('2');

  // Download: a real zip download fires, and the no-creator item is named in the skip warning.
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('compdef-download-selected').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.zip$/);

  const warning = page.getByTestId('compdef-download-warning');
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('Passwortrichtlinie');
  await expect(warning).toContainText('1');

  // Delete the (still fully) selected items — confirm() is auto-accepted below.
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTestId('compdef-delete-selected').click();
  await expect(page.getByTestId('compdef-empty')).toBeVisible();
});

test('cancelling the delete-confirmation dialog leaves the selection untouched', async ({ page }) => {
  await page.goto('/#/component-definitions');
  await page.getByTestId('compdef-upload-input').setInputFiles(withCreatorFixture);
  await page.getByTestId('compdef-select-item').check();

  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByTestId('compdef-delete-selected').click();
  await expect(page.getByTestId('compdef-item')).toHaveCount(1);
});

test.afterEach(async ({ page }) => {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('talos');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
});
