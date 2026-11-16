/**
 * Global unhandled-rejection logging (ADR-0039, ADR-0002).
 * Decision IDs: ADR-0001, ADR-0002, ADR-0039.
 * Covers TEST-LIB-05.
 */
import { describe, it, expect, vi } from 'vitest';
import { installGlobalErrorLogging } from '@/app/globalErrorLogging';
import { createLogger } from '@/shared/logger';
import { UpstreamLoadError } from '@/data/upstreamFetch';

describe('installGlobalErrorLogging (TEST-LIB-05)', () => {
  it('logs an unhandled rejection as a structured error with decision_ids and the upstream problem', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const target = new EventTarget();
    const log = createLogger('test');
    installGlobalErrorLogging(target as unknown as Window, log);
    const reason = new UpstreamLoadError('boom', { resource: 'threat-catalog', url: 'u', status: 404, detail: 'HTTP 404' });
    const event = Object.assign(new Event('unhandledrejection'), { reason });
    target.dispatchEvent(event);
    const [record] = log.getBuffer();
    expect(record).toMatchObject({
      level: 'error',
      message: 'Unhandled promise rejection',
      decisionIds: ['ADR-0039', 'ADR-0002'],
      context: { name: 'UpstreamLoadError', message: 'boom', problem: { status: 404 } },
    });
  });
});
