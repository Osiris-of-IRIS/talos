/**
 * The real app defaults to German (ADR-0012, DEFAULT_LANGUAGE). E2E specs that assert on
 * translated UI chrome (not OSCAL artifact data) pin English via the language switcher so
 * assertions stay stable regardless of language/wording.
 */
import type { Page } from '@playwright/test';

export async function useEnglishUi(page: Page): Promise<void> {
  await page.getByTestId('language-switcher').selectOption('en');
}
