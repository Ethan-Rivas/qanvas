import { describe, expect, it } from 'vitest';
import type { Circuit } from '../circuit/model';
import { translator } from '../i18n/i18n';
import { blochVector, formatState } from '../sim/analysis';
import { simulate } from '../sim/simulator';
import { explainStep } from './explain';

const t = translator('en');

function explain(circuit: Circuit, step: number) {
  const states = simulate(circuit);
  return explainStep(circuit, step, states[step - 1], states[step], t, 'en');
}

describe('state analysis', () => {
  it('finds each qubit’s Bloch vector, shrinking to zero when fully entangled', () => {
    const plusI = simulate({ qubits: 2, columns: [[{ gate: 'H', targets: [0] }], [{ gate: 'S', targets: [0] }]] }).at(-1)!;
    const y = blochVector(plusI, 0);
    expect([y.x, y.y, y.z].map((v) => +v.toFixed(12))).toEqual([0, 1, 0]);
    expect(blochVector(plusI, 1).z).toBeCloseTo(1, 12);

    const bell = simulate({ qubits: 2, columns: [[{ gate: 'H', targets: [0] }], [{ gate: 'X', controls: [0], targets: [1] }]] }).at(-1)!;
    expect(Math.hypot(...Object.values(blochVector(bell, 1)))).toBeCloseTo(0, 12);
  });

  it('writes states as short sums of kets', () => {
    const state = (circuit: Circuit) => formatState(simulate(circuit).at(-1)!);
    expect(state({ qubits: 3, columns: [[{ gate: 'H', targets: [0] }], [{ gate: 'X', controls: [0], targets: [1] }]] })).toBe('(|000⟩ + |110⟩)/√2');
    expect(state({ qubits: 1, columns: [[{ gate: 'H', targets: [0] }], [{ gate: 'T', targets: [0] }]] })).toBe('(|0⟩ + e^(iπ/4)|1⟩)/√2');
    expect(state({ qubits: 1, columns: [[{ gate: 'X', targets: [0] }], [{ gate: 'Y', targets: [0] }]] })).toBe('−i|0⟩');
    expect(state({ qubits: 3, columns: [[0, 1, 2].map((q) => ({ gate: 'H' as const, targets: [q] }))] })).toBe('(|000⟩ + |001⟩ + … + |111⟩)/√8');
    expect(state({ qubits: 1, columns: [[{ gate: 'RY', targets: [0], angle: 1 }]] })).toBe('0.878|0⟩ + 0.479|1⟩');
  });
});

describe('step explanations', () => {
  const ghz: Circuit = { qubits: 3, columns: [[{ gate: 'H', targets: [0] }], [{ gate: 'X', controls: [0], targets: [1] }], [{ gate: 'X', controls: [1], targets: [2] }]] };

  it('explains the gate and notices new entanglement', () => {
    const step = explain(ghz, 2);
    expect(step.label).toBe('CNOT');
    expect(step.title).toBe('A conditional flip');
    expect(step.sentences).toEqual([
      'Flips q1 only when q0 is 1.',
      'q0 and q1 are now entangled, so their Bloch arrows shrink: their states can no longer be described on their own.',
    ]);
    expect([step.before, step.after]).toEqual(['(|000⟩ + |100⟩)/√2', '(|000⟩ + |110⟩)/√2']);
  });

  it('says when a step changes nothing, or only the global phase', () => {
    expect(explain({ qubits: 1, columns: [[{ gate: 'Z', targets: [0] }]] }, 1).sentences.at(-1)).toBe("This step didn't change the state.");
    const flipped = explain({ qubits: 1, columns: [[{ gate: 'X', targets: [0] }], [{ gate: 'Z', targets: [0] }]] }, 2);
    expect(flipped.sentences.at(-1)).toBe('Only the global phase changed. No measurement can tell the difference.');
  });

  it('describes same-kind gates in one column together', () => {
    const step = explain({ qubits: 2, columns: [[{ gate: 'H', targets: [0] }, { gate: 'H', targets: [1] }]] }, 1);
    expect(step.label).toBe('H');
    expect(step.title).toBe('2 gates at once');
    expect(step.sentences[0]).toMatch(/^Sends q0 and q1 from \|0⟩/);
  });
});
