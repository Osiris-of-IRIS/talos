/**
 * Shared toast notification system (T-035, ADR-0002/0010/0012). `success`/`info` auto-dismiss;
 * `warning`/`error` persist until the user dismisses them (a UX correctness decision — an error the
 * user hasn't finished reading shouldn't vanish on a timer).
 * Covers TEST-TOAST-01.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast } from '@/shared/toast';

function Trigger({ message, level }: { message: string; level?: 'info' | 'success' | 'warning' | 'error' }) {
  const { showToast } = useToast();
  return (
    <button type="button" onClick={() => showToast(message, level)}>
      trigger
    </button>
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('useToast() with no <ToastProvider> mounted', () => {
  it('is a safe no-op (isolated component tests never crash)', () => {
    function Standalone() {
      const { showToast } = useToast();
      showToast('hello');
      return <div data-testid="ok" />;
    }
    expect(() => render(<Standalone />)).not.toThrow();
    expect(screen.getByTestId('ok')).toBeInTheDocument();
  });
});

describe('ToastProvider', () => {
  it('renders a toast when showToast is called', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger message="Upload complete" level="success" />
      </ToastProvider>,
    );
    expect(screen.queryByTestId('toast')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'trigger' }));
    expect(screen.getByTestId('toast')).toHaveTextContent('Upload complete');
  });

  it('stacks multiple toasts', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger message="First" />
        <Trigger message="Second" />
      </ToastProvider>,
    );
    const [first, second] = screen.getAllByRole('button', { name: 'trigger' });
    await user.click(first!);
    await user.click(second!);
    expect(screen.getAllByTestId('toast')).toHaveLength(2);
  });

  it('gives error toasts role="alert" and others role="status"', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger message="Bad thing" level="error" />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'trigger' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Bad thing');
  });

  it('auto-dismisses a success toast after the timeout', async () => {
    vi.useFakeTimers();
    render(
      <ToastProvider durationMs={1000}>
        <Trigger message="Saved" level="success" />
      </ToastProvider>,
    );
    await act(async () => {
      screen.getByRole('button', { name: 'trigger' }).click();
    });
    expect(screen.getByTestId('toast')).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByTestId('toast')).not.toBeInTheDocument();
  });

  it('does not auto-dismiss a warning or error toast — only manual dismiss removes it', async () => {
    vi.useFakeTimers();
    render(
      <ToastProvider durationMs={1000}>
        <Trigger message="Careful" level="warning" />
      </ToastProvider>,
    );
    await act(async () => {
      screen.getByRole('button', { name: 'trigger' }).click();
    });
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByTestId('toast')).toBeInTheDocument();
  });

  it('lets the user manually dismiss any toast', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger message="Careful" level="error" />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'trigger' }));
    expect(screen.getByTestId('toast')).toBeInTheDocument();
    await user.click(screen.getByTestId('toast-dismiss'));
    expect(screen.queryByTestId('toast')).not.toBeInTheDocument();
  });

  it('defaults to the info level when none is given', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger message="Just so you know" />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'trigger' }));
    expect(screen.getByTestId('toast')).toHaveAttribute('data-level', 'info');
  });
});
