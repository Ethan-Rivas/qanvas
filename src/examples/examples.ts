import { sameCircuit, type Circuit } from '../circuit/model';
import circuits from './circuits.json';

export const EXAMPLE_IDS = ['bell', 'ghz', 'superdense-coding', 'teleportation', 'bit-flip-code', 'noisy-bell', 'deutsch-jozsa', 'grover-2'] as const;

export type ExampleId = (typeof EXAMPLE_IDS)[number];

export const EXAMPLES = circuits as Record<ExampleId, Circuit>;

export function isExampleId(id: string | null): id is ExampleId {
  return EXAMPLE_IDS.includes(id as ExampleId);
}

/** The example this circuit still is, unchanged; edits keep `exampleId` for the title and challenge, but not this. */
export function unchangedExample(circuit: Circuit, id: string | null): ExampleId | null {
  return isExampleId(id) && sameCircuit(EXAMPLES[id], circuit) ? id : null;
}
