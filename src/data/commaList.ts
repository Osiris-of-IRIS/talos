/** Split a comma-separated string into trimmed, non-empty entries — the shared parser behind
 * every comma-list UI field (set-parameter values, profile control-id lists) and comma-separated
 * OSCAL prop value (a control's `tags` prop, ADR-0032 §4). */
export function parseCommaList(text: string): string[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
