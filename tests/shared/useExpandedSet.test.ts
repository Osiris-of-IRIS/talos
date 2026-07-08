/**
 * useExpandedSet: shared collapse/expand state (Set<id>) for summary-row list UIs
 * (component-definition editor/detail, SSP editor/detail). Decision IDs: ADR-0001.
 * Covers TEST-COLLAPSE-01.
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useExpandedSet } from '@/shared/useExpandedSet';

describe('useExpandedSet', () => {
  it('starts empty (nothing expanded) by default', () => {
    const { result } = renderHook(() => useExpandedSet());
    expect(result.current.isExpanded('a')).toBe(false);
  });

  it('accepts an initial set of expanded ids', () => {
    const { result } = renderHook(() => useExpandedSet(['a', 'b']));
    expect(result.current.isExpanded('a')).toBe(true);
    expect(result.current.isExpanded('b')).toBe(true);
    expect(result.current.isExpanded('c')).toBe(false);
  });

  it('expand() adds an id; collapse() removes it', () => {
    const { result } = renderHook(() => useExpandedSet());
    act(() => result.current.expand('a'));
    expect(result.current.isExpanded('a')).toBe(true);
    act(() => result.current.collapse('a'));
    expect(result.current.isExpanded('a')).toBe(false);
  });

  it('toggle() flips membership independently per id', () => {
    const { result } = renderHook(() => useExpandedSet());
    act(() => result.current.toggle('a'));
    expect(result.current.isExpanded('a')).toBe(true);
    expect(result.current.isExpanded('b')).toBe(false);

    act(() => result.current.toggle('b'));
    expect(result.current.isExpanded('a')).toBe(true);
    expect(result.current.isExpanded('b')).toBe(true);

    act(() => result.current.toggle('a'));
    expect(result.current.isExpanded('a')).toBe(false);
    expect(result.current.isExpanded('b')).toBe(true);
  });
});
