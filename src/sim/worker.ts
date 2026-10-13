import type { Circuit } from '../circuit/model';
import { simulateSteps } from './simulator';

export interface SimulationRequest {
  id: number;
  circuit: Circuit;
}

/** The state before any column and after each one, packed one after another. */
export type SimulationResponse =
  | { id: number; mixed: boolean; re: Float64Array; im: Float64Array }
  | { id: number; error: string };

self.onmessage = (event: MessageEvent<SimulationRequest>) => {
  const { id, circuit } = event.data;
  try {
    const { mixed, re, im } = simulateSteps(circuit);
    self.postMessage({ id, mixed, re, im } satisfies SimulationResponse, { transfer: [re.buffer, im.buffer] });
  } catch (error) {
    self.postMessage({ id, error: String(error) } satisfies SimulationResponse);
  }
};
