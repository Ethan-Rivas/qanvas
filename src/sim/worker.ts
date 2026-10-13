import type { Circuit } from '../circuit/model';
import { isMixed, simulate } from './simulator';

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
    const states = simulate(circuit);
    const size = states[0].re.length;
    const re = new Float64Array(states.length * size);
    const im = new Float64Array(states.length * size);
    states.forEach((state, k) => {
      re.set(state.re, k * size);
      im.set(state.im, k * size);
    });
    self.postMessage({ id, mixed: isMixed(states[0]), re, im } satisfies SimulationResponse, { transfer: [re.buffer, im.buffer] });
  } catch (error) {
    self.postMessage({ id, error: String(error) } satisfies SimulationResponse);
  }
};
