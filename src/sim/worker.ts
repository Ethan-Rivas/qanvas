import type { Circuit } from '../circuit/model';
import { simulate } from './simulator';

export interface SimulationRequest {
  id: number;
  circuit: Circuit;
}

/** The state before any column and after each one, packed one after another. */
export type SimulationResponse =
  | { id: number; re: Float64Array; im: Float64Array }
  | { id: number; error: string };

self.onmessage = (event: MessageEvent<SimulationRequest>) => {
  const { id, circuit } = event.data;
  try {
    const states = simulate(circuit);
    const size = 1 << circuit.qubits;
    const re = new Float64Array(states.length * size);
    const im = new Float64Array(states.length * size);
    states.forEach((state, k) => {
      re.set(state.re, k * size);
      im.set(state.im, k * size);
    });
    self.postMessage({ id, re, im } satisfies SimulationResponse, { transfer: [re.buffer, im.buffer] });
  } catch (error) {
    self.postMessage({ id, error: String(error) } satisfies SimulationResponse);
  }
};
