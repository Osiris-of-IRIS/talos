// Covers TEST-LOG-01 (structured logger: decision_ids, app version, ring buffer, console styling)
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createLogger, type LogRecord } from '@/shared/logger';

describe('createLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes structured records with decisionIds, version and an ISO timestamp', () => {
    const logger = createLogger('1.2.3');
    const record = logger.info('boot ok', ['ADR-0002'], { foo: 'bar' });

    expect(record.level).toBe('info');
    expect(record.message).toBe('boot ok');
    expect(record.decisionIds).toEqual(['ADR-0002']);
    expect(record.version).toBe('1.2.3');
    expect(record.context).toEqual({ foo: 'bar' });
    expect(() => new Date(record.timestamp).toISOString()).not.toThrow();
  });

  it('omits context entirely when none is given', () => {
    const logger = createLogger('1.2.3');
    const record = logger.info('no context', ['ADR-0002']);
    expect(record.context).toBeUndefined();
  });

  it('routes info/warn/error to the matching console method', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = createLogger('1.2.3');

    logger.info('an info', ['ADR-0002']);
    logger.warn('a warning', ['ADR-0002']);
    logger.error('an error', ['ADR-0002']);

    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    // yellow warnings, red errors (ADR-0002 console convention, hex tokens from ADR-0010)
    expect(warnSpy.mock.calls[0]?.some((arg) => typeof arg === 'string' && arg.includes('#f59e0b'))).toBe(
      true,
    );
    expect(errorSpy.mock.calls[0]?.some((arg) => typeof arg === 'string' && arg.includes('#dc2626'))).toBe(
      true,
    );
  });

  it('keeps a ring buffer capped at 200 records, evicting the oldest first', () => {
    const logger = createLogger('1.2.3');
    vi.spyOn(console, 'info').mockImplementation(() => {});

    for (let i = 0; i < 205; i += 1) {
      logger.info(`msg-${i}`, ['ADR-0002']);
    }

    const buffer = logger.getBuffer();
    expect(buffer).toHaveLength(200);
    expect(buffer[0]?.message).toBe('msg-5');
    expect(buffer[buffer.length - 1]?.message).toBe('msg-204');
  });

  it('returns a copy from getBuffer so callers cannot mutate internal state', () => {
    const logger = createLogger('1.2.3');
    vi.spyOn(console, 'info').mockImplementation(() => {});
    logger.info('one', ['ADR-0002']);

    const buffer = logger.getBuffer() as LogRecord[];
    buffer.push({
      timestamp: 'x',
      level: 'info',
      message: 'injected',
      decisionIds: [],
      version: '1.2.3',
    });

    expect(logger.getBuffer()).toHaveLength(1);
  });

  it('gives independent instances their own buffer', () => {
    const a = createLogger('1.0.0');
    const b = createLogger('2.0.0');
    vi.spyOn(console, 'info').mockImplementation(() => {});

    a.info('only in a', ['ADR-0002']);

    expect(a.getBuffer()).toHaveLength(1);
    expect(b.getBuffer()).toHaveLength(0);
  });
});
