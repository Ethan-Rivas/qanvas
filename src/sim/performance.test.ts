import { expect, it } from 'vitest';
import type { Circuit, Operation } from '../circuit/model';
import { probabilities, simulate } from './simulator';

it('simulates 12 qubits and 50 columns in under 100 ms', () => {
  const columns: Operation[][] = Array.from({ length: 50 }, (_, c) => [
    { gate: 'H', targets: [c % 12] },
    { gate: 'RY', targets: [(c + 3) % 12], angle: 0.1 * c },
    { gate: 'X', controls: [(c + 5) % 12], targets: [(c + 6) % 12] },
    { gate: 'X', controls: [(c + 7) % 12, (c + 8) % 12], targets: [(c + 9) % 12] },
  ]);
  const circuit: Circuit = { qubits: 12, columns };
  simulate(circuit);

  const start = performance.now();
  const states = simulate(circuit);
  probabilities(states[states.length - 1]);
  expect(performance.now() - start).toBeLessThan(100);
});
