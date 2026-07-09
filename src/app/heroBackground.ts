// Resolves src/config.ts's HERO_BACKGROUND key to an actual asset URL. Kept separate from
// config.ts on purpose: e2e specs import config.ts directly under Node/esbuild (not through
// Vite), and a `@/assets/*.png` import there breaks that transform (ADR-0029). Only UI code
// (LandingPage, bundled by Vite) imports this module.
import heroBackgroundEpic from '@/assets/hero_background.png';
import heroBackgroundSimple from '@/assets/hero_background_simple.png';
import { HERO_BACKGROUND, type HeroBackgroundKey } from '@/config';

const HERO_BACKGROUND_IMAGES: Record<HeroBackgroundKey, string> = {
  epic: heroBackgroundEpic,
  simple: heroBackgroundSimple,
};

/** Resolved asset URL for the configured HERO_BACKGROUND. */
export function heroBackgroundUrl(): string {
  return HERO_BACKGROUND_IMAGES[HERO_BACKGROUND];
}
