/**
 * E2E: create a component-definition via the editor, then see it in the list and detail.
 * Follows the E2E convention in docs/testing.md. Decision IDs: ADR-0001, ADR-0003, ADR-0015.
 * Covers TEST-CDEF-EDIT-02 (feature_registry IMPL-001).
 */
import { test, expect } from '@playwright/test';

test('create a component-definition end to end', async ({ page }) => {
  await page.goto('/#/component-definitions');
  await page.getByTestId('compdef-new').click();

  await expect(page.getByTestId('compdef-editor')).toBeVisible();
  await page.getByTestId('md-title').fill('E2E Policy');
  await page.getByTestId('add-component').click();
  await page.getByTestId('component-title').fill('nginx');

  // External link should be externalized into back-matter (ADR-0015).
  await page.getByTestId('md-link-href').fill('https://nist.gov');
  await page.getByTestId('md-add-link').click();
  await expect(page.getByTestId('bm-resource')).toHaveCount(1);

  // Component type from the allowed list, and a full implemented requirement with a set-parameter.
  await page.getByTestId('component-type').fill('policy');
  await page.getByTestId('add-control-implementation').click();
  // ci-source/ir-control-id/sp-param-id are <EntitySearchField> (ADR-0013, T-036 follow-up) —
  // the actual fillable input carries `${dataTestId}-input`; the bare testid is a wrapper div.
  await page.getByTestId('ci-source-input').fill('#cat-1');
  await page.getByTestId('add-requirement').click();
  await page.getByTestId('ir-control-id-input').fill('ASST.1.1.2');
  await page.getByTestId('add-set-parameter').click();
  await page.getByTestId('sp-param-id-input').fill('asst.1.1.2-prm1');
  await page.getByTestId('sp-values').fill('den IT-Betrieb');

  await page.getByTestId('save-compdef').click();

  // Landed on detail; the requirement and its set-parameter render once expanded (item 3).
  await expect(page.getByTestId('compdef-detail')).toBeVisible();
  await expect(page.getByText('E2E Policy')).toBeVisible();
  await page.getByTestId('compdef-component-summary').click();
  await expect(page.getByTestId('compdef-requirement')).toContainText('ASST.1.1.2');
  await expect(page.getByTestId('compdef-set-parameters')).toContainText('asst.1.1.2-prm1');

  // And it is listed.
  await page.goto('/#/component-definitions');
  await expect(page.getByTestId('compdef-item')).toHaveCount(1);
  await expect(page.getByText('E2E Policy')).toBeVisible();
});

test.afterEach(async ({ page }) => {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('talos');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
});
