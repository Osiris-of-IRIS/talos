/**
 * Pure helpers for rendering an OSCAL control consistently. Decision IDs: ADR-0016.
 * (No DOM/React here — the <ControlDisplay> component consumes these.)
 */
import type { Control, Parameter, Part } from './control';

export const STATEMENT_MAX_CHARS = 180;

function propValue(props: { name: string; value: string }[] | undefined, name: string): string | undefined {
  return props?.find((p) => p.name === name)?.value;
}

/** Control label = prop name="label" value, else the control id (ADR-0016 §1). */
export function getControlLabel(control: Control): string {
  return propValue(control.props, 'label') ?? control.id;
}

/** Headline text: "{label} {title}". */
export function getControlHeadline(control: Control): string {
  return `${getControlLabel(control)} ${control.title}`.trim();
}

/** The "uuid" shown in the tooltip = the alt-identifier prop (ADR-0016 §4). */
export function getControlAltIdentifier(control: Control): string | undefined {
  return propValue(control.props, 'alt-identifier');
}

/** Concatenated prose of all `statement` parts (usually one). */
export function getStatementProse(control: Control): string {
  return (control.parts ?? [])
    .filter((p) => p.name === 'statement')
    .map((p) => p.prose ?? '')
    .filter(Boolean)
    .join('\n');
}

/** Flatten every part (and nested parts) to `{name, prose}` for the tooltip. */
export function flattenParts(parts: Part[] | undefined): { name: string; prose: string }[] {
  const out: { name: string; prose: string }[] = [];
  for (const p of parts ?? []) {
    if (p.prose) out.push({ name: p.name, prose: p.prose });
    out.push(...flattenParts(p.parts));
  }
  return out;
}

/** Resolve the display value of a param: `< values | label | id >` (ADR-0016 §3). */
export function paramDisplayValue(param: Parameter | undefined, overrideValues?: string[]): string {
  const values = overrideValues && overrideValues.length > 0 ? overrideValues : param?.values;
  const inner = values && values.length > 0 ? values.join(', ') : (param?.label ?? param?.id ?? '?');
  return `< ${inner} >`;
}

export interface Segment {
  type: 'text' | 'param';
  text: string;
  paramId?: string;
}

const INSERT_RE = /\{\{\s*insert:\s*param\s*,\s*([^}\s]+)\s*\}\}/g;

/**
 * Split prose into text/param segments, resolving `{{ insert: param, id }}` insertions to their
 * display value. `setParameters` (from the referencing requirement) overrides param values.
 */
export function toSegments(
  prose: string,
  params: Parameter[] | undefined,
  setParameters?: { paramId: string; values?: string[] }[],
): Segment[] {
  const paramById = new Map((params ?? []).map((p) => [p.id, p]));
  const overrideById = new Map((setParameters ?? []).map((s) => [s.paramId, s.values]));
  const segments: Segment[] = [];
  let lastIndex = 0;
  for (const m of prose.matchAll(INSERT_RE)) {
    const start = m.index ?? 0;
    if (start > lastIndex) segments.push({ type: 'text', text: prose.slice(lastIndex, start) });
    const paramId = m[1]!;
    segments.push({
      type: 'param',
      text: paramDisplayValue(paramById.get(paramId), overrideById.get(paramId)),
      paramId,
    });
    lastIndex = start + m[0].length;
  }
  if (lastIndex < prose.length) segments.push({ type: 'text', text: prose.slice(lastIndex) });
  return segments;
}

/** Truncate a segment list to `max` visible characters, appending an ellipsis if cut. */
export function truncateSegments(segments: Segment[], max: number = STATEMENT_MAX_CHARS): Segment[] {
  const out: Segment[] = [];
  let used = 0;
  for (const seg of segments) {
    if (used >= max) break;
    const remaining = max - used;
    if (seg.text.length <= remaining) {
      out.push(seg);
      used += seg.text.length;
    } else {
      out.push({ ...seg, text: seg.text.slice(0, remaining).trimEnd() + '…' });
      used = max;
      break;
    }
  }
  return out;
}

/** Convenience: resolved + truncated statement segments for display (ADR-0016 §2–§3). */
export function getStatementSegments(
  control: Control,
  setParameters?: { paramId: string; values?: string[] }[],
  max: number = STATEMENT_MAX_CHARS,
): Segment[] {
  return truncateSegments(toSegments(getStatementProse(control), control.params, setParameters), max);
}
