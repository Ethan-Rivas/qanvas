import { expect, it } from 'vitest';
import { probabilities, simulate, simulateSteps } from './simulator';

it('keeps one state per step, with q0 as the leftmost bit of the index', () => {
  const states = simulate({
    qubits: 2,
    columns: [
      [{ gate: 'X', targets: [0] }],
      [{ gate: 'H', targets: [1] }],
      [{ gate: 'M', targets: [0, 1] }],
    ],
  });

  expect(states).toHaveLength(4);
  expect([...probabilities(states[0])]).toEqual([1, 0, 0, 0]);
  expect([...probabilities(states[1])]).toEqual([0, 0, 1, 0]);
  const final = [...probabilities(states[3])];
  expect(final[2]).toBeCloseTo(0.5, 12);
  expect(final[3]).toBeCloseTo(0.5, 12);
});

it('refuses invalid circuits', () => {
  expect(() => simulate({ qubits: 1, columns: [[{ gate: 'H', targets: [1] }]] })).toThrow('qubit-range');
});

it('refuses density matrices above 8 qubits instead of running out of memory', () => {
  expect(() => simulateSteps({ qubits: 9, columns: [[{ gate: 'RESET', targets: [0] }]] })).toThrow(/up to 8 qubits/);
});
