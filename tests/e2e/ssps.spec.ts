/**
 * E2E: SSP major flow — upload → list → detail. Follows the E2E convention in docs/testing.md.
 * Decision IDs: ADR-0001, ADR-0004 (feature IMPL-002, TEST-SSP-02).
 */
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { useEnglishUi } from './i18nHelpers';

const fixture = fileURLToPath(new URL('../data/ssp-minimal.json', import.meta.url));

test('upload an SSP, see it listed, open its detail', async ({ page }) => {
  await page.goto('/#/ssps');

  await expect(page.getByTestId('ssp-empty')).toBeVisible();

  await page.getByTestId('ssp-upload-input').setInputFiles(fixture);

  const item = page.getByTestId('ssp-item');
  await expect(item).toHaveCount(1);
  await expect(item.getByText('Beispiel-SSP Webserver')).toBeVisible();

  await item.getByText('Beispiel-SSP Webserver').click();
  await expect(page.getByTestId('ssp-detail')).toBeVisible();
  await expect(page.getByTestId('ssp-system-name')).toContainText('Webserver Cluster');
  await expect(page.getByTestId('ssp-requirement')).toContainText('IA-5');
});

test('landing page links to SSPs', async ({ page }) => {
  await page.goto('/');
  await useEnglishUi(page);
  await page.getByRole('link', { name: /System Security Plans/ }).click();
  await expect(page).toHaveURL(/#\/ssps/);
  await expect(page.getByRole('heading', { name: /System Security Plans/ })).toBeVisible();
});

test.afterEach(async ({ page }) => {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('talos');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
});
