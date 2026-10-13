import { expect, it } from 'vitest';
import type { Circuit, Noise } from '../circuit/model';
import { blochLength, blochVector, pureVector } from './analysis';
import { finalState, isMixed, probabilities, simulate, withReadout } from './simulator';

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

const round = (p: ArrayLike<number>) => Array.from(p, (v) => Math.round(v * 1e9) / 1e9);
const noise = (rates: Partial<Noise>): Noise => ({ oneQubit: 0, twoQubit: 0, readout: 0, ...rates });

it('leaves a qubit in a random state with probability p after each gate', () => {
  const state = finalState({ qubits: 1, columns: [[{ gate: 'X', targets: [0] }]], noise: noise({ oneQubit: 0.1 }) });
  expect(round(probabilities(state))).toEqual([0.05, 0.95]);
  expect(blochVector(state, 0).z).toBeCloseTo(-0.9, 12);
});

it('lets a misread measurement drive every gate that depends on it the same way', () => {
  const states = simulate({
    qubits: 3,
    columns: [
      [{ gate: 'H', targets: [0] }],
      [{ gate: 'M', targets: [0] }],
      [{ gate: 'X', targets: [1], condition: { qubit: 0, value: 1 } }, { gate: 'X', targets: [2], condition: { qubit: 0, value: 1 } }],
    ],
    noise: noise({ readout: 0.1 }),
  });
  expect(round(probabilities(states[2]))).toEqual([0.5, 0, 0, 0, 0.5, 0, 0, 0]);
  expect(round(probabilities(states[3]))).toEqual([0.45, 0, 0, 0.05, 0.05, 0, 0, 0.45]);
});

it('adds noise to a conditional gate only when it runs', () => {
  const state = finalState({
    qubits: 2,
    columns: [[{ gate: 'X', targets: [0] }], [{ gate: 'M', targets: [0] }], [{ gate: 'X', targets: [1], condition: { qubit: 0, value: 0 } }]],
    noise: noise({ oneQubit: 0.1 }),
  });
  expect(round(probabilities(state))).toEqual([0.0025, 0.0475, 0.95, 0]);
});

it('applies readout error to what measuring reports, keeping the state vector when it is the only noise', () => {
  const state = finalState({ qubits: 2, columns: [[{ gate: 'X', targets: [0] }]], noise: noise({ readout: 0.1 }) });
  expect(isMixed(state)).toBe(false);
  expect(round(withReadout(probabilities(state), 2, 0.1))).toEqual([0.09, 0.01, 0.81, 0.09]);
});
