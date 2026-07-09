/**
 * E2E: component-definition major flow — upload → list → detail → download.
 * Decision IDs: ADR-0001, ADR-0004 (feature IMPL-001, TEST-CDEF-02).
 */
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { useEnglishUi } from './i18nHelpers';

const fixture = fileURLToPath(
  new URL('../data/component-definition-minimal.json', import.meta.url),
);

test('upload a component-definition, see it listed, open its detail', async ({ page }) => {
  await page.goto('/#/component-definitions');

  // Empty state first.
  await expect(page.getByTestId('compdef-empty')).toBeVisible();

  // Upload the OSCAL file.
  await page.getByTestId('compdef-upload-input').setInputFiles(fixture);

  // It appears in the list.
  const item = page.getByTestId('compdef-item');
  await expect(item).toHaveCount(1);
  await expect(item.getByText('Passwortrichtlinie')).toBeVisible();

  // Open the detail and verify content rendered from OSCAL.
  await item.getByText('Passwortrichtlinie').click();
  await expect(page.getByTestId('compdef-detail')).toBeVisible();
  await expect(page.getByText('Password Policy')).toBeVisible();

  // Components are collapsed by default (item 3) — expand to see requirements.
  await page.getByTestId('compdef-component-summary').click();
  await expect(page.getByTestId('compdef-requirement')).toContainText('IA-5');
});

test('landing page links to component-definitions', async ({ page }) => {
  await page.goto('/');
  await useEnglishUi(page);
  // Scoped to <main>: the persistent sidebar (ADR-0029) also links here, by the same text.
  await page.locator('main').getByRole('link', { name: /Component-Definitions/ }).click();
  await expect(page).toHaveURL(/#\/component-definitions/);
  await expect(page.getByRole('heading', { name: /Component-Definitions/ })).toBeVisible();
});

test.afterEach(async ({ page }) => {
  // Keep tests isolated: clear IndexedDB between runs.
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('talos');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
});
