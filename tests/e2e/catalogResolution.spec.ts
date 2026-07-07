/**
 * E2E: upload a catalog, then a component-definition referencing one of its controls, and see the
 * control resolved via <ControlDisplay>. Follows docs/testing.md. Decision IDs: ADR-0016 (T-120).
 * Covers TEST-CATRES-02 (feature_registry PLAT-004).
 */
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const catalog = fileURLToPath(new URL('../data/catalog-minimal.json', import.meta.url));
const compdef = fileURLToPath(new URL('../data/component-definition-referencing.json', import.meta.url));

test('resolved control renders with headline, statement param, and viewer link', async ({ page }) => {
  // 1. Upload the catalog.
  await page.goto('/#/catalogs');
  await page.getByTestId('catalog-upload-input').setInputFiles(catalog);
  await expect(page.getByTestId('catalog-item')).toHaveCount(1);

  // 2. Upload the referencing component-definition and open it.
  await page.goto('/#/component-definitions');
  await page.getByTestId('compdef-upload-input').setInputFiles(compdef);
  await page.getByTestId('compdef-item').getByText('Referencing CD').click();
  // Components are collapsed by default (item 3) — expand to see the resolved control.
  await page.getByTestId('compdef-component-summary').click();

  // 3. The control resolves: headline "{id} {title}" + coloured param token from set-parameters.
  await expect(page.getByTestId('control-display')).toBeVisible();
  await expect(page.getByTestId('control-headline')).toHaveText('ASST.1.1.2 Zuweisung');
  await expect(page.getByTestId('control-param')).toHaveText('< den IT-Betrieb >');

  // headline links to the external viewer (ADR-0008)
  await expect(page.getByTestId('control-headline')).toHaveAttribute('target', '_blank');
});

test.afterEach(async ({ page }) => {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('talos');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
});
