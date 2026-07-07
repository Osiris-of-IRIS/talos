/**
 * <ControlDisplay> rendering. Decision IDs: ADR-0001, ADR-0016.
 * Fixture derived from BSI Stand-der-Technik-Bibliothek (CC-BY-SA-4.0). Covers TEST-CTRL-02.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ControlDisplay } from '@/features/shared/ControlDisplay';
import type { Control } from '@/models/control';
import sample from '../data/control-sample.json';

const control = sample as Control;

describe('ControlDisplay', () => {
  it('renders the headline as "{id} {title}" when no label', () => {
    render(<ControlDisplay control={control} />);
    expect(screen.getByTestId('control-headline')).toHaveTextContent('ASST.1.1.2 Zuweisung');
  });

  it('renders the statement with a coloured param token', () => {
    render(<ControlDisplay control={control} />);
    const param = screen.getByTestId('control-param');
    expect(param).toHaveTextContent('< zuständigen Personen oder Rollen >');
    expect(param).toHaveClass('control-param');
  });

  it('applies set-parameter overrides to the param token', () => {
    render(
      <ControlDisplay control={control} setParameters={[{ paramId: 'asst.1.1.2-prm1', values: ['den IT-Betrieb'] }]} />,
    );
    expect(screen.getByTestId('control-param')).toHaveTextContent('< den IT-Betrieb >');
  });

  it('tooltip shows id, uuid (alt-identifier), class, and all parts', () => {
    render(<ControlDisplay control={control} />);
    const tip = screen.getByTestId('control-tooltip');
    expect(tip).toHaveTextContent('id: ASST.1.1.2');
    expect(tip).toHaveTextContent('uuid: b3a2e5a0-380a-4770-86e6-ea1d8d586ad7');
    expect(tip).toHaveTextContent('class: BSI-Stand-der-Technik-Kernel');
    const parts = within(tip).getAllByTestId('control-tooltip-part');
    expect(parts).toHaveLength(2); // statement + guidance
  });

  it('headline links to the external viewer when a url is given', () => {
    render(<ControlDisplay control={control} viewerUrl="https://bsi-community.github.io/Stand-der-Technik-Viewer/" />);
    const link = screen.getByTestId('control-headline');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('href', 'https://bsi-community.github.io/Stand-der-Technik-Viewer/');
  });
});
