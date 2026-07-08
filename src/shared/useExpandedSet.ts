// Shared collapse/expand state for summary-row list UIs (component/SSP editors + detail pages).
import { useState } from 'react';

export interface ExpandedSet {
  isExpanded: (id: string) => boolean;
  toggle: (id: string) => void;
  expand: (id: string) => void;
  collapse: (id: string) => void;
}

export function useExpandedSet(initial?: Iterable<string>): ExpandedSet {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(initial));

  return {
    isExpanded: (id) => expanded.has(id),
    toggle: (id) =>
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    expand: (id) => setExpanded((prev) => new Set(prev).add(id)),
    collapse: (id) =>
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      }),
  };
}
