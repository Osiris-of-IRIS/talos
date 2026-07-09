// Covers TEST-BOOT-01 (fail-fast boot error screen on invalid runtime config, T-025, ADR-0002)
import { describe, it, expect } from 'vitest';
import { renderBootError } from '@/app/bootError';

describe('renderBootError', () => {
  it('renders every error message as text (never mounts the app) into the given root', () => {
    const root = document.createElement('div');
    renderBootError(root, ['basePath must start with "/"', 'viewerUrl must be an absolute URL']);

    expect(root.textContent).toContain('basePath must start with "/"');
    expect(root.textContent).toContain('viewerUrl must be an absolute URL');
  });

  it('never injects error text as HTML (XSS-safe even though messages are internal)', () => {
    const root = document.createElement('div');
    renderBootError(root, ['<img src=x onerror=alert(1)>']);

    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('replaces any previous content in the root', () => {
    const root = document.createElement('div');
    root.textContent = 'stale content';
    renderBootError(root, ['broken config']);

    expect(root.textContent).not.toContain('stale content');
  });
});
