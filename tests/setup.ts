// Vitest setup. Decision IDs: ADR-0001.
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';

// jsdom has no ResizeObserver; Recharts' <ResponsiveContainer> (ADR-0034) needs one to mount at
// all. A no-op stub is enough — charts under test render at a fixed size regardless.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
