import type { Circuit } from '../circuit/model';
import circuits from './circuits.json';

export const EXAMPLE_IDS = ['bell', 'ghz', 'superdense-coding', 'teleportation', 'deutsch-jozsa', 'grover-2'] as const;

export type ExampleId = (typeof EXAMPLE_IDS)[number];

export const EXAMPLES = circuits as Record<ExampleId, Circuit>;

export function isExampleId(id: string | null): id is ExampleId {
  return EXAMPLE_IDS.includes(id as ExampleId);
}
