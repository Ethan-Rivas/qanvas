import { describe, expect, it } from 'vitest';
import { isDynamic, partwayMeasurements, validateCircuit, type Circuit } from './model';

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

  it('rejects malformed operations', () => {
    const circuit: Circuit = {
      qubits: 2,
      columns: [
        [{ gate: 'M', targets: [0] }],
        [{ gate: 'H', targets: [0] }, { gate: 'RX', targets: [1] }],
        [{ gate: 'Y', controls: [0], targets: [5] }],
      ],
    };
    expect(validateCircuit(circuit).map((e) => e.code)).toEqual(['angle', 'control-count', 'qubit-range']);
  });

  it('accepts gates after a measurement, resets and conditions on a measured qubit', () => {
    const circuit: Circuit = {
      qubits: 2,
      columns: [
        [{ gate: 'H', targets: [0] }],
        [{ gate: 'M', targets: [0] }],
        [{ gate: 'X', targets: [1], condition: { qubit: 0, value: 1 } }],
        [{ gate: 'RESET', targets: [0] }, { gate: 'M', targets: [1] }],
      ],
    };
    expect(validateCircuit(circuit)).toEqual([]);
    expect(isDynamic(circuit)).toBe(true);
    expect(partwayMeasurements(circuit)).toEqual(new Set(['1:0']));
    expect(isDynamic(ghz)).toBe(false);
  });

  it('rejects conditions on qubits that were not just measured, and on gates that cannot take one', () => {
    const cond = (qubit: number) => ({ qubit, value: 1 as const });
    const bad: Circuit = {
      qubits: 3,
      columns: [
        [{ gate: 'M', targets: [0, 1] }],
        [{ gate: 'H', targets: [1] }, { gate: 'X', targets: [2], condition: cond(0) }],
        [{ gate: 'X', targets: [2], condition: cond(1) }],
        [{ gate: 'X', controls: [1], targets: [2], condition: cond(0) }],
        [{ gate: 'Z', targets: [2], condition: cond(0) }, { gate: 'H', targets: [0] }],
      ],
    };
    expect(validateCircuit(bad).map((e) => [e.column, e.code])).toEqual([
      [2, 'condition'],
      [3, 'condition'],
      [4, 'condition'],
    ]);
  });
});
