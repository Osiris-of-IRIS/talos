/**
 * MarkupEditor: textarea + toolbar (inserts OSCAL markup syntax, ADR-0009 subset) + a Preview
 * toggle that renders via the existing <Markup> renderer. Decision IDs: ADR-0001, ADR-0009.
 * Covers TEST-MDEDIT-01.
 */
import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MarkupEditor } from '@/shared/MarkupEditor';

function Wrapper({ initial = '', multiline = true, rows }: { initial?: string; multiline?: boolean; rows?: number }) {
  const [value, setValue] = useState(initial);
  return (
    <MarkupEditor value={value} onChange={setValue} multiline={multiline} rows={rows} dataTestId="me" ariaLabel="Body" />
  );
}

describe('MarkupEditor', () => {
  it('renders a textarea and propagates typing via onChange', async () => {
    const user = userEvent.setup();
    render(<Wrapper />);
    const textarea = screen.getByTestId('me-textarea');
    await user.type(textarea, 'hello');
    expect(textarea).toHaveValue('hello');
  });

  it('sets the textarea rows to the requested minimum visible lines', () => {
    render(<Wrapper rows={7} />);
    expect(screen.getByTestId('me-textarea')).toHaveAttribute('rows', '7');
  });

  it('wraps the current selection in ** when Bold is clicked', async () => {
    const user = userEvent.setup();
    render(<Wrapper initial="hello world" />);
    const textarea = screen.getByTestId('me-textarea') as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 5); // "hello"
    await user.click(screen.getByTestId('me-bold'));
    expect(textarea).toHaveValue('**hello** world');
  });

  it('wraps the current selection in * when Italic is clicked', async () => {
    const user = userEvent.setup();
    render(<Wrapper initial="hello world" />);
    const textarea = screen.getByTestId('me-textarea') as HTMLTextAreaElement;
    textarea.setSelectionRange(6, 11); // "world"
    await user.click(screen.getByTestId('me-italic'));
    expect(textarea).toHaveValue('hello *world*');
  });

  it('wraps the current selection in backticks when Code is clicked', async () => {
    const user = userEvent.setup();
    render(<Wrapper initial="run npm test" />);
    const textarea = screen.getByTestId('me-textarea') as HTMLTextAreaElement;
    textarea.setSelectionRange(4, 12); // "npm test"
    await user.click(screen.getByTestId('me-code'));
    expect(textarea).toHaveValue('run `npm test`');
  });

  it('wraps the current selection as link text with a placeholder url when Link is clicked', async () => {
    const user = userEvent.setup();
    render(<Wrapper initial="see docs" />);
    const textarea = screen.getByTestId('me-textarea') as HTMLTextAreaElement;
    textarea.setSelectionRange(4, 8); // "docs"
    await user.click(screen.getByTestId('me-link'));
    expect(textarea).toHaveValue('see [docs](https://)');
  });

  it('inserts a placeholder pair at the cursor when nothing is selected', async () => {
    const user = userEvent.setup();
    render(<Wrapper initial="" />);
    const textarea = screen.getByTestId('me-textarea') as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 0);
    await user.click(screen.getByTestId('me-bold'));
    expect(textarea).toHaveValue('**bold**');
  });

  it('toggles a rendered preview via the Preview button', async () => {
    const user = userEvent.setup();
    render(<Wrapper initial="**important**" />);
    expect(screen.getByTestId('me-textarea')).toBeInTheDocument();

    await user.click(screen.getByTestId('me-preview-toggle'));
    expect(screen.queryByTestId('me-textarea')).not.toBeInTheDocument();
    const preview = screen.getByTestId('me-preview');
    expect(preview.querySelector('strong')).not.toBeNull();

    await user.click(screen.getByTestId('me-preview-toggle'));
    expect(screen.getByTestId('me-textarea')).toBeInTheDocument();
  });
});
