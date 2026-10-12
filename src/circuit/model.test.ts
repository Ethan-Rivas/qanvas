import { describe, expect, it } from 'vitest';
import { validateCircuit, type Circuit } from './model';

const ghz: Circuit = {
  qubits: 3,
  columns: [
    [{ gate: 'H', targets: [0] }],
    [{ gate: 'X', controls: [0], targets: [1] }],
    [{ gate: 'X', controls: [1], targets: [2] }],
    [{ gate: 'M', targets: [0, 1, 2] }],
  ],
};

describe('validateCircuit', () => {
  it('accepts a valid circuit', () => {
    expect(validateCircuit(ghz)).toEqual([]);
  });

  it('rejects two operations on the same qubit in one column', () => {
    const circuit: Circuit = {
      qubits: 2,
      columns: [[{ gate: 'H', targets: [0] }, { gate: 'X', controls: [1], targets: [0] }]],
    };
    expect(validateCircuit(circuit)).toEqual([{ code: 'qubit-overlap', column: 0, operation: 1 }]);
  });

  it('rejects gates after a measurement and malformed operations', () => {
    const circuit: Circuit = {
      qubits: 2,
      columns: [
        [{ gate: 'M', targets: [0] }],
        [{ gate: 'H', targets: [0] }, { gate: 'RX', targets: [1] }],
        [{ gate: 'Y', controls: [0], targets: [5] }],
      ],
    };
    expect(validateCircuit(circuit).map((e) => e.code)).toEqual([
      'after-measure',
      'angle',
      'control-count',
      'after-measure',
      'qubit-range',
    ]);
  });
});
