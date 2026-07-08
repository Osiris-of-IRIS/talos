/**
 * DatalistInput: wraps a native input+datalist so focusing clears the displayed text (browsers
 * filter datalist suggestions against the current value, so a pre-filled field otherwise appears
 * to offer only itself) without touching the underlying model unless the user actually types.
 * Decision IDs: ADR-0001. Covers TEST-DLINPUT-01.
 */
import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DatalistInput } from '@/shared/DatalistInput';

function Wrapper({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <DatalistInput
      value={value}
      onChange={setValue}
      options={[
        { value: 'software', label: 'Any software, operating system, or firmware.' },
        { value: 'hardware', label: 'A physical device.' },
      ]}
      listId="opts"
      dataTestId="di"
      ariaLabel="Type"
    />
  );
}

describe('DatalistInput', () => {
  it('shows the current value initially', () => {
    render(<Wrapper initial="software" />);
    expect(screen.getByTestId('di')).toHaveValue('software');
  });

  it('clears the displayed value on focus (so all datalist options are offered)', async () => {
    const user = userEvent.setup();
    render(<Wrapper initial="software" />);
    await user.click(screen.getByTestId('di'));
    expect(screen.getByTestId('di')).toHaveValue('');
  });

  it('restores the original value on blur if the user typed nothing', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Wrapper initial="software" />
        <button>elsewhere</button>
      </>,
    );
    await user.click(screen.getByTestId('di'));
    await user.click(screen.getByRole('button', { name: 'elsewhere' }));
    expect(screen.getByTestId('di')).toHaveValue('software');
  });

  it('keeps a typed value after blur, and propagates it live via onChange', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Wrapper initial="software" />
        <button>elsewhere</button>
      </>,
    );
    await user.click(screen.getByTestId('di'));
    await user.type(screen.getByTestId('di'), 'hardware');
    expect(screen.getByTestId('di')).toHaveValue('hardware');
    await user.click(screen.getByRole('button', { name: 'elsewhere' }));
    expect(screen.getByTestId('di')).toHaveValue('hardware');
  });

  it('renders datalist options with value/label split', () => {
    render(<Wrapper initial="" />);
    const options = document.querySelectorAll('#opts option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveAttribute('value', 'software');
    expect(options[0]).toHaveTextContent('Any software, operating system, or firmware.');
  });
});
