/**
 * E2E: OSCAL schema compliance (ADR-0040) in a real browser under the page's CSP — the build-time
 * validators run without eval. Validate on export (draft dialog naming every non-compliant field,
 * draft file carries "$schema") and the compliance gate at the SSP import-profile picker.
 * Decision IDs: ADR-0001, ADR-0040, ADR-0019.
 * Covers TEST-SCHEMA-09.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { useEnglishUi } from './i18nHelpers';

const draftSsp = fileURLToPath(
  new URL('../data/schema/invalid/ssp-talos-draft.json', import.meta.url),
);
const brokenProfile = fileURLToPath(
  new URL('../data/schema/invalid/profile-no-imports.json', import.meta.url),
);

test('a non-compliant SSP downloads only as a draft, after a dialog naming every non-compliant field', async ({
  page,
}) => {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy|EvalError|unsafe-eval/i.test(m.text())) problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(e.message));

  await page.goto('/#/ssps');
  await useEnglishUi(page);
  await page.getByTestId('ssp-upload-input').setInputFiles(draftSsp);
  // Imported anyway, flagged (third-party content stays importable and editable).
  await expect(
    page.getByTestId('toast').filter({ hasText: 'is not OSCAL 1.2.3 compliant' }),
  ).toBeVisible();
  const item = page.getByTestId('ssp-item');
  await expect(item.getByTestId('compliance-badge')).toHaveAttribute(
    'data-status',
    'non-compliant',
  );

  await item.getByRole('link').click();
  await expect(page.getByTestId('ssp-detail')).toBeVisible();
  await page.getByTestId('download-artifact').click();
  const dialog = page.getByTestId('export-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('compliance-issue')).toHaveText([
    'System characteristics › System IDs: Required field is missing.',
    'System characteristics › System name: Must not be empty.',
    'System characteristics › System information › Information types: Required field is missing.',
    'System implementation › Components: Required field is missing.',
  ]);

  const downloadPromise = page.waitForEvent('download');
  await dialog.getByTestId('export-draft-download').click();
  const download = await downloadPromise;
  const json = JSON.parse(readFileSync((await download.path())!, 'utf-8')) as Record<
    string,
    unknown
  >;
  expect(json.$schema).toBe('http://csrc.nist.gov/ns/oscal/1.2.3/oscal-ssp-schema.json');
  expect(JSON.stringify(json)).not.toContain('[]');
  expect(problems).toEqual([]);
});

test('a non-compliant profile cannot be used as an SSP baseline; the UI says which fields to fix', async ({
  page,
}) => {
  await page.goto('/#/profiles');
  await useEnglishUi(page);
  await page.getByTestId('profile-upload-input').setInputFiles(brokenProfile);
  await expect(page.getByTestId('profile-item')).toHaveCount(1);

  await page.goto('/#/ssps/new');
  await page.getByTestId('ssp-import-profile-input').fill('Profile without');
  const option = page.getByTestId('es-result').filter({ hasText: 'Profile without imports' });
  await expect(option).toContainText('not OSCAL-compliant');
  await option.click();
  const notice = page.getByTestId('input-blocked-notice');
  await expect(notice).toContainText('"Profile without imports" cannot be used here');
  await expect(notice).toContainText(
    'Metadata › Version: Must not be empty or start or end with whitespace.',
  );
  await expect(notice).toContainText('Imports: Required field is missing.');
  await expect(page.getByTestId('ssp-import-profile-resolved')).toHaveCount(0);
});

test.afterEach(async ({ page }) => {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('talos');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
});
