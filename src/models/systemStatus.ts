/** OSCAL system/component status vocabulary (open — datalist offers these, custom values allowed). */
export interface SystemStatusOption {
  value: string;
  description: string;
}

export const SYSTEM_STATUS_STATES: SystemStatusOption[] = [
  { value: 'operational', description: 'The system is currently operational.' },
  { value: 'under-development', description: 'The system is currently under development.' },
  { value: 'under-major-modification', description: 'The system is undergoing a major change.' },
  { value: 'disposition', description: 'The system is no longer operational.' },
  { value: 'other', description: 'The system is in a state not covered by the other values.' },
];
