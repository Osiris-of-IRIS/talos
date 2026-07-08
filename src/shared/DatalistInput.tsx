// Native input+datalist wrapper: clears the displayed value on focus so the browser's own
// substring-filtering (against the current text) doesn't hide every option except the one
// already selected — a well-known <datalist> UX gotcha with controlled, pre-filled fields.
// Reverts to the original value on blur if the user didn't type anything.
import { useEffect, useState } from 'react';

export interface DatalistOption {
  value: string;
  label?: string;
}

interface DatalistInputProps {
  value: string;
  onChange: (next: string) => void;
  options: DatalistOption[];
  listId: string;
  dataTestId?: string;
  ariaLabel?: string;
  placeholder?: string;
}

export function DatalistInput({ value, onChange, options, listId, dataTestId, ariaLabel, placeholder }: DatalistInputProps) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!focused) setDraft(value);
  }, [value, focused]);

  return (
    <>
      <input
        data-testid={dataTestId}
        aria-label={ariaLabel}
        placeholder={placeholder}
        list={listId}
        value={draft}
        onFocus={() => {
          setFocused(true);
          setDraft('');
        }}
        onBlur={() => {
          setFocused(false);
          setDraft(value);
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange(e.target.value);
        }}
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </datalist>
    </>
  );
}
