/**
 * Control-display pure helpers. Decision IDs: ADR-0001, ADR-0016.
 * Fixture derived from BSI Stand-der-Technik-Bibliothek (CC-BY-SA-4.0). Covers TEST-CTRL-01.
 */
import { describe, it, expect } from 'vitest';
import {
  getControlLabel,
  getControlHeadline,
  getControlAltIdentifier,
  getStatementProse,
  flattenParts,
  paramDisplayValue,
  toSegments,
  truncateSegments,
  getStatementSegments,
} from '@/models/controlDisplay';
import type { Control } from '@/models/control';
import sample from '../data/control-sample.json';

const control = sample as Control;

describe('headline & identity', () => {
  it('falls back to control.id when no label prop', () => {
    expect(getControlLabel(control)).toBe('ASST.1.1.2');
    expect(getControlHeadline(control)).toBe('ASST.1.1.2 Zuweisung');
  });

  it('uses the label prop when present', () => {
    const withLabel: Control = { ...control, props: [{ name: 'label', value: 'AC-1' }] };
    expect(getControlLabel(withLabel)).toBe('AC-1');
    expect(getControlHeadline(withLabel)).toBe('AC-1 Zuweisung');
  });

  it('reads the alt-identifier prop as the uuid', () => {
    expect(getControlAltIdentifier(control)).toBe('b3a2e5a0-380a-4770-86e6-ea1d8d586ad7');
  });
});

describe('statement & parts', () => {
  it('extracts the statement prose', () => {
    expect(getStatementProse(control)).toContain('{{ insert: param, asst.1.1.2-prm1 }}');
  });

  it('flattens all parts for the tooltip', () => {
    const parts = flattenParts(control.parts);
    expect(parts.map((p) => p.name)).toEqual(['statement', 'guidance']);
  });
});

describe('param display value', () => {
  it('uses label when no values', () => {
    expect(paramDisplayValue(control.params![0])).toBe('< zuständigen Personen oder Rollen >');
  });
  it('prefers override set-parameter values', () => {
    expect(paramDisplayValue(control.params![0], ['den IT-Betrieb'])).toBe('< den IT-Betrieb >');
  });
  it('joins multiple values', () => {
    expect(paramDisplayValue(control.params![0], ['A', 'B'])).toBe('< A, B >');
  });
});

describe('insertion parsing', () => {
  it('replaces {{ insert: param }} with a coloured param segment', () => {
    const segs = toSegments(getStatementProse(control), control.params);
    const paramSeg = segs.find((s) => s.type === 'param');
    expect(paramSeg?.text).toBe('< zuständigen Personen oder Rollen >');
    expect(paramSeg?.paramId).toBe('asst.1.1.2-prm1');
    // surrounding text preserved
    expect(segs[0]?.text).toContain('Informationen und Assets MUSS');
    expect(segs.at(-1)?.text).toContain('zuweisen.');
  });

  it('honors override values from set-parameters', () => {
    const segs = toSegments(getStatementProse(control), control.params, [
      { paramId: 'asst.1.1.2-prm1', values: ['den IT-Betrieb'] },
    ]);
    expect(segs.find((s) => s.type === 'param')?.text).toBe('< den IT-Betrieb >');
  });

  it('leaves prose without insertions as a single text segment', () => {
    const segs = toSegments('plain prose', undefined);
    expect(segs).toEqual([{ type: 'text', text: 'plain prose' }]);
  });
});

describe('truncation to 180 chars', () => {
  it('truncates and appends an ellipsis, preserving segment types', () => {
    const long = 'x'.repeat(200);
    const segs = truncateSegments([{ type: 'text', text: long }], 180);
    expect(segs[0]!.text.length).toBe(181); // 180 chars + ellipsis
    expect(segs[0]!.text.endsWith('…')).toBe(true);
  });

  it('keeps short statements intact', () => {
    const segs = getStatementSegments(control);
    const joined = segs.map((s) => s.text).join('');
    expect(joined).not.toContain('…');
    expect(joined).toContain('< zuständigen Personen oder Rollen >');
  });
});
