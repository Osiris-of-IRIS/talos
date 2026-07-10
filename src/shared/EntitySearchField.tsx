/**
 * <EntitySearchField> (T-036, ADR-0013): a controlled value/onChange drop-in replacement for
 * `<DatalistInput>`, backed by `useEntitySearch`. Same clear-on-focus/restore-on-blur-if-untouched
 * contract as `<DatalistInput>` (the same well-known pre-filled-autocomplete UX gotcha), but a
 * ranked, debounced dropdown instead of the browser's native `<datalist>` substring match — and,
 * via `useEntitySearch`'s `items`/`types` modes, able to search either IndexedDB artifacts or a
 * caller-provided nested-data list (controls within a catalog, params within a control).
 *
 * Picking a result commits its `id` via `onChange` (matching what `<DatalistInput>`'s callers
 * already expect — e.g. the source picker's options carry a `#<uuid>`-shaped ref as `value`);
 * free-text keystrokes still pass through unfiltered on every change, so manual/legacy entry
 * keeps working exactly as it does today.
 */
import { useEffect, useState } from 'react';
import { useEntitySearch, type SearchItem } from './useEntitySearch';
import type { OscalArtifactType } from '@/models/oscalBase';
import './entitySearch.css';

export interface EntitySearchFieldProps {
  value: string;
  onChange: (next: string) => void;
  /** Restrict the IndexedDB-backed index to these artifact types; defaults to every type. Ignored
   * when `items` is provided. */
  types?: OscalArtifactType[];
  /** Search this fixed list instead of IndexedDB — for nested data (controls, params). */
  items?: SearchItem[];
  scope?: (item: SearchItem) => boolean;
  limit?: number;
  debounceMs?: number;
  dataTestId?: string;
  ariaLabel?: string;
  placeholder?: string;
}

export function EntitySearchField({
  value,
  onChange,
  types,
  items,
  scope,
  limit,
  debounceMs,
  dataTestId,
  ariaLabel,
  placeholder,
}: EntitySearchFieldProps) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const { setQuery, results, refresh } = useEntitySearch({ types, items, scope, limit, debounceMs });

  useEffect(() => {
    if (!focused) setDraft(value);
  }, [value, focused]);

  useEffect(() => {
    setHighlighted(0);
  }, [results]);

  function select(item: SearchItem) {
    setDraft(item.id);
    onChange(item.id);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = results[highlighted];
      if (item) select(item);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const showResults = open && results.length > 0;

  return (
    <div className="entity-search">
      <input
        data-testid={dataTestId ? `${dataTestId}-input` : undefined}
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={draft}
        onFocus={() => {
          setFocused(true);
          setOpen(true);
          setDraft('');
          setQuery('');
          // the IndexedDB-backed index is only fetched once per mount (useEntitySearch), so a
          // long-lived field re-opened after other artifacts were created/edited would otherwise
          // keep offering a stale snapshot from first mount.
          void refresh();
        }}
        onBlur={() => {
          setFocused(false);
          setOpen(false);
          setDraft(value);
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          setQuery(e.target.value);
          onChange(e.target.value);
        }}
        onKeyDown={onKeyDown}
      />
      {showResults && (
        <ul
          className="entity-search-results"
          data-testid={dataTestId ? `${dataTestId}-results` : undefined}
        >
          {results.map((item, i) => (
            <li
              key={item.id}
              data-testid="es-result"
              className={i === highlighted ? 'entity-search-result--highlighted' : undefined}
              // mousedown (not click) fires before the input's onBlur closes the dropdown, so the
              // click lands on the option instead of a dropdown that's already gone — the same
              // race DatalistInput.tsx's own focus/blur handling exists to avoid.
              onMouseDown={(e) => {
                e.preventDefault();
                select(item);
              }}
            >
              {item.title}
              {item.badge && <small> ({item.badge})</small>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
