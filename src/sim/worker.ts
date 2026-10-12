import type { Circuit } from '../circuit/model';
import { finalState, probabilities } from './simulator';

export interface SimulationRequest {
  id: number;
  circuit: Circuit;
}

export type SimulationResponse =
  | { id: number; qubits: number; probabilities: Float64Array }
  | { id: number; error: string };

self.onmessage = (event: MessageEvent<SimulationRequest>) => {
  const { id, circuit } = event.data;
  try {
    const p = probabilities(finalState(circuit));
    self.postMessage({ id, qubits: circuit.qubits, probabilities: p } satisfies SimulationResponse, { transfer: [p.buffer] });
  } catch (error) {
    self.postMessage({ id, error: String(error) } satisfies SimulationResponse);
  }
};
