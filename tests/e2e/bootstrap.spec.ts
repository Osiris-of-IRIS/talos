/**
 * E2E: SSP-bootstrap assistant major flow — prerequisite gating, asset-list upload, catalog
 * upload, generate SSPs, idempotent re-run. Follows the E2E convention in docs/testing.md.
 * Decision IDs: ADR-0001, ADR-0026 (feature ASST-002).
 * Covers TEST-ASST-03.
 */
import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { useEnglishUi } from './i18nHelpers';
import { TARGET_OBJECT_CATEGORIES_URL } from '../../src/config';

const assetTypesCsv = fileURLToPath(new URL('../data/golden/recplast/asset_types.csv', import.meta.url));
const assetsCsv = fileURLToPath(new URL('../data/golden/recplast/assets.csv', import.meta.url));
const mappingsCsv = fileURLToPath(new URL('../data/golden/recplast/mappings.csv', import.meta.url));
const catalogFixture = fileURLToPath(
  new URL('../data/catalog-target-object-categories.json', import.meta.url),
);

// Real BSI rows for the categories the golden recplast mappings reference (client-pc/laptop ->
// Endgeräte, server -> Hostsysteme, both Typ="IT-Systeme"). Mocked so generation is deterministic
// and doesn't depend on live network access in CI — same reasoning PLAT-002 documents for why the
// BSI-library e2e stays offline-fixture-based rather than hitting the real network.
const TARGET_OBJECT_CATEGORIES_CSV =
  'Zielobjekt,Definition,Typ,Kategorie,Synonyme,ChildOfUUID,UUID\n' +
  'IT-Systeme,"Eigenständige informationstechnische Systeme.",IT-Systeme,Technisch,,,427da6dd-d744-4b2b-88b7-f0a695f21e14\n' +
  'Endgeräte,"End User Devices.",IT-Systeme,Technisch,,427da6dd-d744-4b2b-88b7-f0a695f21e14,837781a4-7b47-4695-9545-a3310eac7a66\n' +
  'Hostsysteme,"Serversysteme.",IT-Systeme,Technisch,Server,427da6dd-d744-4b2b-88b7-f0a695f21e14,19c946fc-e991-44ee-87c5-7bbe5d5aaf55\n';

async function mockTargetObjectCategories(page: Page): Promise<void> {
  await page.route(TARGET_OBJECT_CATEGORIES_URL, (route) =>
    route.fulfill({ status: 200, contentType: 'text/csv', body: TARGET_OBJECT_CATEGORIES_CSV }),
  );
}

test('bootstrap assistant is gated on the landing page until an asset list is uploaded', async ({ page }) => {
  await page.goto('/');
  await useEnglishUi(page);
  await expect(page.getByTestId('feature-card-disabled')).toContainText('SSP Bootstrap Assistant');

  await page.getByRole('link', { name: 'Assets' }).click();
  await expect(page.getByTestId('assets-empty')).toBeVisible();
  await page.getByTestId('assets-upload-types').setInputFiles(assetTypesCsv);
  await page.getByTestId('assets-upload-assets').setInputFiles(assetsCsv);
  await page.getByTestId('assets-upload-mappings').setInputFiles(mappingsCsv);
  await page.getByTestId('assets-upload-submit').click();
  await expect(page.getByTestId('assets-count')).toBeVisible();

  await page.goto('/');
  await useEnglishUi(page);
  await expect(page.getByRole('link', { name: 'SSP Bootstrap Assistant' })).toBeVisible();
});

test('generates SSPs (NIST-style) from the uploaded asset list, then updates in place on re-run', async ({
  page,
}) => {
  await mockTargetObjectCategories(page);

  // Prerequisites: asset list + a catalog.
  await page.goto('/#/assets');
  await useEnglishUi(page);
  await page.getByTestId('assets-upload-types').setInputFiles(assetTypesCsv);
  await page.getByTestId('assets-upload-assets').setInputFiles(assetsCsv);
  await page.getByTestId('assets-upload-mappings').setInputFiles(mappingsCsv);
  await page.getByTestId('assets-upload-submit').click();
  await expect(page.getByTestId('assets-count')).toBeVisible();

  await page.goto('/#/catalogs');
  await page.getByTestId('catalog-upload-input').setInputFiles(catalogFixture);
  await expect(page.getByTestId('catalog-item')).toHaveCount(1);

  await page.goto('/#/bootstrap');
  await page.getByTestId('bootstrap-catalog-select').selectOption({
    label: 'BSI Kernel (target-object-category excerpt)',
  });
  // NIST-style is the default methodology.
  await page.getByTestId('bootstrap-generate').click();
  await expect(page.getByTestId('bootstrap-result')).toContainText('SSP(s) created', { timeout: 30_000 });

  const firstResult = await page.getByTestId('bootstrap-result').textContent();
  const firstCreatedCount = Number(firstResult?.match(/(\d+) SSP\(s\) created/)?.[1]);
  expect(firstCreatedCount).toBeGreaterThan(0);

  await page.getByRole('link', { name: 'View SSPs' }).click();
  await expect(page).toHaveURL(/#\/ssps/);
  const sspCountAfterFirstRun = await page.getByTestId('ssp-item').count();
  expect(sspCountAfterFirstRun).toBe(firstCreatedCount);

  // Re-run: idempotent — updates, not duplicates.
  await page.goto('/#/bootstrap');
  await page.getByTestId('bootstrap-catalog-select').selectOption({
    label: 'BSI Kernel (target-object-category excerpt)',
  });
  await page.getByTestId('bootstrap-generate').click();
  await expect(page.getByTestId('bootstrap-result')).toContainText(`0 SSP(s) created`, { timeout: 30_000 });

  await page.goto('/#/ssps');
  await expect(page.getByTestId('ssp-item')).toHaveCount(sspCountAfterFirstRun);
});

test.afterEach(async ({ page }) => {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('talos');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
});
