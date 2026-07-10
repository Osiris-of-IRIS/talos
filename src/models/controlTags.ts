/**
 * A control's `tags` classification prop (BSI convention) — verified against the live
 * `Grundschutz++-catalog.json`: a single `props[name="tags"]` entry holding a comma-separated
 * string (e.g. `"Compliance Management, Produktbeschreibung"`), not one prop per tag
 * (ADR-0032 §4).
 */
import type { Control } from './control';
import { parseCommaList } from '@/data/commaList';

const TAGS_PROP = 'tags';

export function getControlTags(control: Control): string[] {
  const raw = control.props?.find((p) => p.name === TAGS_PROP)?.value;
  return raw ? parseCommaList(raw) : [];
}

export function controlHasTag(control: Control, tag: string): boolean {
  return getControlTags(control).includes(tag);
}
