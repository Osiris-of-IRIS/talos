/**
 * <EntitySearchField> — controlled value/onChange drop-in replacement for <DatalistInput>
 * (T-036, ADR-0013), backed by useEntitySearch. Shows the current value; typing opens a ranked
 * dropdown (IndexedDB-backed via `types`, or a fixed `items` list for nested data); picking a
 * result commits its `id`; free-text entry still passes through on every keystroke.
 * Covers TEST-SEARCH-02.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests } from '@/data/db';
import { ArtifactRepository } from '@/data/artifactRepository';
import { EntitySearchField } from '@/shared/EntitySearchField';
import type { ComponentDefinition } from '@/models/componentDefinition';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

async function seedComponentDefinitions() {
  await ArtifactRepository.forType<ComponentDefinition>('componentDefinition').create({
    uuid: '11111111-1111-4111-8111-111111111111',
    type: 'componentDefinition',
    origin: 'user',
    artifact: { uuid: '11111111-1111-4111-8111-111111111111', metadata: { title: 'Password Policy', version: '1.0.0', oscalVersion: '1.2.2' } },
  });
}

function Controlled({
  initial = '',
  ...rest
}: Partial<React.ComponentProps<typeof EntitySearchField>> & { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <EntitySearchField value={value} onChange={setValue} dataTestId="es" {...rest} />;
}

describe('EntitySearchField', () => {
  it('shows the current value even when nothing has been typed', () => {
    render(<EntitySearchField value="#some-existing-ref" onChange={() => {}} dataTestId="es" />);
    expect(screen.getByTestId('es-input')).toHaveValue('#some-existing-ref');
  });

  it('opens a dropdown of matching IndexedDB artifacts when typing', async () => {
    await seedComponentDefinitions();
    const user = userEvent.setup();
    render(<Controlled types={['componentDefinition']} />);
    await user.clear(screen.getByTestId('es-input'));
    await user.type(screen.getByTestId('es-input'), 'password');
    expect(await screen.findByText('Password Policy')).toBeInTheDocument();
  });

  it('refetches the IndexedDB index on focus, so an artifact created after mount is still found', async () => {
    // A field mounted before an artifact existed (no seed here) must not keep offering a stale
    // snapshot from its first render — refresh() runs again every time it's focused.
    const user = userEvent.setup();
    render(<Controlled types={['componentDefinition']} />);
    await seedComponentDefinitions();
    await user.click(screen.getByTestId('es-input'));
    await user.type(screen.getByTestId('es-input'), 'password');
    expect(await screen.findByText('Password Policy')).toBeInTheDocument();
  });

  it('commits the picked item\'s id via onChange and closes the dropdown', async () => {
    await seedComponentDefinitions();
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<EntitySearchField value="" onChange={onChange} types={['componentDefinition']} dataTestId="es" />);
    await user.type(screen.getByTestId('es-input'), 'password');
    await user.click(await screen.findByText('Password Policy'));

    expect(onChange).toHaveBeenLastCalledWith('11111111-1111-4111-8111-111111111111');
    expect(screen.queryByTestId('es-result')).not.toBeInTheDocument();
  });

  it('searches a fixed items list (nested data, e.g. control-ids) instead of IndexedDB', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <EntitySearchField
        value=""
        onChange={onChange}
        items={[
          { id: 'APP.1.1.1', title: 'APP.1.1.1 Allgemeine Anwendungen' },
          { id: 'SYS.1.1.1', title: 'SYS.1.1.1 Allgemeiner Server' },
        ]}
        dataTestId="es"
      />,
    );
    await user.type(screen.getByTestId('es-input'), 'SYS');
    await user.click(await screen.findByText('SYS.1.1.1 Allgemeiner Server'));
    expect(onChange).toHaveBeenLastCalledWith('SYS.1.1.1');
  });

  it('still passes through free-text keystrokes (manual entry not blocked)', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<EntitySearchField value="" onChange={onChange} items={[]} dataTestId="es" />);
    await user.type(screen.getByTestId('es-input'), 'x');
    expect(onChange).toHaveBeenLastCalledWith('x');
  });

  it('navigates the dropdown with the keyboard and commits on Enter', async () => {
    await seedComponentDefinitions();
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<EntitySearchField value="" onChange={onChange} types={['componentDefinition']} dataTestId="es" />);
    await user.type(screen.getByTestId('es-input'), 'password');
    await screen.findByTestId('es-result');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('11111111-1111-4111-8111-111111111111');
  });

  it('closes on Escape without committing', async () => {
    await seedComponentDefinitions();
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<EntitySearchField value="" onChange={onChange} types={['componentDefinition']} dataTestId="es" />);
    await user.type(screen.getByTestId('es-input'), 'password');
    await screen.findByTestId('es-result');
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('es-result')).not.toBeInTheDocument();
    // Escape doesn't revert the free-text already typed (matches DatalistInput's own restore-on-blur-only behavior).
    expect(onChange).toHaveBeenLastCalledWith('password');
  });
});
