// Hook: load every workspace SSP group (T-512, ADR-0037) — for the SSP editor's membership
// picker and the "apply to group" propagation target list.
import { useEffect, useState } from 'react';
import { getAllSspGroups } from '@/data/sspGroupRepository';
import type { SspGroup } from '@/models/sspGroup';

export function useWorkspaceSspGroups(): SspGroup[] {
  const [groups, setGroups] = useState<SspGroup[]>([]);
  useEffect(() => {
    void getAllSspGroups().then(setGroups);
  }, []);
  return groups;
}
