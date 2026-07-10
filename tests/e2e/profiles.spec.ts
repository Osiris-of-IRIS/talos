/**
 * E2E: Profile major flows — upload → list → detail; create via the editor (catalog import,
 * by-id inclusion); the Profile Creation Assistant's target-object picker. Follows the E2E
 * convention in docs/testing.md. Decision IDs: ADR-0001, ADR-0032.
 * Covers TEST-PROF-08.
 */
import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { useEnglishUi } from './i18nHelpers';
import { TARGET_OBJECT_CATEGORIES_URL } from '../../src/config';

const profileFixture = fileURLToPath(new URL('../data/profile-minimal.json', import.meta.url));
const catalogFixture = fileURLToPath(
  new URL('../data/catalog-target-object-categories.json', import.meta.url),
);

// Same mocked BSI rows and reasoning as tests/e2e/bootstrap.spec.ts: deterministic, no live
// network dependency in CI. "Hostsysteme" is a child of "IT-Systeme" here, matching the
// catalog-target-object-categories fixture's SYS.1.1.1 control.
const TARGET_OBJECT_CATEGORIES_CSV =
  'Zielobjekt,Definition,Typ,Kategorie,Synonyme,ChildOfUUID,UUID\n' +
  'IT-Systeme,"Eigenständige informationstechnische Systeme.",IT-Systeme,Technisch,,,427da6dd-d744-4b2b-88b7-f0a695f21e14\n' +
  'Hostsysteme,"Serversysteme.",IT-Systeme,Technisch,Server,427da6dd-d744-4b2b-88b7-f0a695f21e14,19c946fc-e991-44ee-87c5-7bbe5d5aaf55\n';

async function mockTargetObjectCategories(page: Page): Promise<void> {
  await page.route(TARGET_OBJECT_CATEGORIES_URL, (route) =>
    route.fulfill({ status: 200, contentType: 'text/csv', body: TARGET_OBJECT_CATEGORIES_CSV }),
  );
}

test('upload a profile, see it listed, open its detail', async ({ page }) => {
  await page.goto('/#/profiles');
  await expect(page.getByTestId('profile-empty')).toBeVisible();

  await page.getByTestId('profile-upload-input').setInputFiles(profileFixture);

  const item = page.getByTestId('profile-item');
  await expect(item).toHaveCount(1);
  await expect(item.getByText('Web Application Baseline')).toBeVisible();

  await item.getByText('Web Application Baseline').click();
  await expect(page.getByTestId('profile-detail')).toBeVisible();
  await expect(page.getByTestId('profile-detail-set-parameters')).toContainText('ia-5.1_prm_2');
});

test('create a profile via the editor: catalog import, specific-controls mode', async ({ page }) => {
  await page.goto('/#/catalogs');
  await page.getByTestId('catalog-upload-input').setInputFiles(catalogFixture);
  await expect(page.getByTestId('catalog-item')).toHaveCount(1);

  await page.goto('/#/profiles/new');
  await page.getByTestId('md-title').fill('E2E Profile');

  await page.getByTestId('profile-import-picker-input').fill('BSI Kernel');
  await page.getByText('BSI Kernel (target-object-category excerpt)').click();
  await page.getByTestId('profile-import-add').click();
  await expect(page.getByTestId('profile-import-source')).toBeVisible();

  await page.getByTestId('profile-import-mode-by-id').check();
  await page.getByTestId('control-checklist-filter').fill('Hostsysteme härten');
  await page.getByTestId('control-checklist-checkbox').first().check();

  await page.getByTestId('save-profile').click();

  await expect(page.getByTestId('profile-detail')).toBeVisible();
  await expect(page.getByTestId('profile-detail-include-control')).toContainText('SYS.1.1.1');
});

test('Profile Creation Assistant: target-object hierarchy picks the right controls', async ({ page }) => {
  await mockTargetObjectCategories(page);

  await page.goto('/#/catalogs');
  await page.getByTestId('catalog-upload-input').setInputFiles(catalogFixture);
  await expect(page.getByTestId('catalog-item')).toHaveCount(1);

  await page.goto('/#/profiles/assistant');
  await page.getByTestId('md-title').fill('Assistant E2E Profile');

  await page.getByTestId('profile-assistant-source-picker-input').fill('BSI Kernel');
  await page.getByText('BSI Kernel (target-object-category excerpt)').click();

  await page.getByTestId('profile-assistant-mode-target-object').check();
  await expect(page.getByTestId('target-object-picker')).toBeVisible();
  await page.getByText('Hostsysteme', { exact: true }).click();
  await expect(page.getByTestId('target-object-match-count')).toContainText('1');

  await page.getByTestId('profile-assistant-create').click();

  await expect(page.getByTestId('profile-detail')).toBeVisible();
  await expect(page.getByTestId('profile-detail-include-control')).toContainText('SYS.1.1.1');
});

test('landing page links to profiles', async ({ page }) => {
  await page.goto('/');
  await useEnglishUi(page);
  // Scoped to <main>: the persistent sidebar (ADR-0029) also links here, by the same text.
  await page.locator('main').getByRole('link', { name: /Profiles/ }).click();
  await expect(page).toHaveURL(/#\/profiles/);
  await expect(page.getByRole('heading', { name: /Profiles/ })).toBeVisible();
});

test.afterEach(async ({ page }) => {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('talos');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
});
