import { expect, it } from 'vitest';
import type { Circuit } from '../circuit/model';
import { blochLength, blochVector, pureVector } from './analysis';
import { finalState, isMixed, probabilities } from './simulator';

const probs = (circuit: Circuit) => [...probabilities(finalState(circuit))].map((p) => Math.round(p * 1e9) / 1e9);

it('measuring partway through leaves a mix of outcomes', () => {
  const state = finalState({ qubits: 1, columns: [[{ gate: 'H', targets: [0] }], [{ gate: 'M', targets: [0] }], [{ gate: 'H', targets: [0] }]] });
  expect(isMixed(state)).toBe(true);
  expect([...probabilities(state)].map((p) => Math.round(p * 1e9) / 1e9)).toEqual([0.5, 0.5]);
  expect(blochLength(blochVector(state, 0))).toBeCloseTo(0, 12);
  expect(pureVector(state)).toBeNull();
});

it('resets a qubit and applies conditions on 1 and on 0', () => {
  expect(probs({ qubits: 2, columns: [[{ gate: 'H', targets: [0] }], [{ gate: 'X', controls: [0], targets: [1] }], [{ gate: 'RESET', targets: [0] }]] })).toEqual([0.5, 0.5, 0, 0]);
  const measuredOne: Circuit = { qubits: 2, columns: [[{ gate: 'X', targets: [0] }], [{ gate: 'M', targets: [0] }], [{ gate: 'X', targets: [1], condition: { qubit: 0, value: 1 } }]] };
  expect(probs(measuredOne)).toEqual([0, 0, 0, 1]);
  const ifZero: Circuit = { qubits: 2, columns: [[{ gate: 'M', targets: [0] }], [{ gate: 'X', targets: [1], condition: { qubit: 0, value: 0 } }]] };
  expect(probs(ifZero)).toEqual([0, 1, 0, 0]);
});

it('teleports a qubit state with real measurements and corrections', () => {
  const [theta, phi] = [1.1, 0.4];
  const state = finalState({
    qubits: 3,
    columns: [
      [{ gate: 'RY', targets: [0], angle: theta }, { gate: 'H', targets: [1] }],
      [{ gate: 'RZ', targets: [0], angle: phi }, { gate: 'X', controls: [1], targets: [2] }],
      [{ gate: 'X', controls: [0], targets: [1] }],
      [{ gate: 'H', targets: [0] }],
      [{ gate: 'M', targets: [0, 1] }],
      [{ gate: 'X', targets: [2], condition: { qubit: 1, value: 1 } }],
      [{ gate: 'Z', targets: [2], condition: { qubit: 0, value: 1 } }],
    ],
  });
  const bloch = blochVector(state, 2);
  expect(bloch.x).toBeCloseTo(Math.sin(theta) * Math.cos(phi), 12);
  expect(bloch.y).toBeCloseTo(Math.sin(theta) * Math.sin(phi), 12);
  expect(bloch.z).toBeCloseTo(Math.cos(theta), 12);
});

it('keeps the state vector for circuits that only measure at the end', () => {
  expect(isMixed(finalState({ qubits: 1, columns: [[{ gate: 'H', targets: [0] }], [{ gate: 'M', targets: [0] }]] }))).toBe(false);
});
