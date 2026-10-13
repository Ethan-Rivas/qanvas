import { describe, expect, it } from 'vitest';
import { movePart, placeGate, removeOperation, removeQubit, setCondition, setNoise, type EditResult } from './edits';
import type { Circuit } from './model';

function ok(result: EditResult) {
  if (!result.ok) throw new Error(`Edit failed: ${result.error}`);
  return result;
}

const empty: Circuit = { qubits: 3, columns: [] };

describe('circuit edits', () => {
  it('builds a GHZ circuit from palette drops, opening a column when a cell is taken', () => {
    let { circuit } = ok(placeGate(empty, 'H', { column: 0, qubit: 0 }));
    ({ circuit } = ok(placeGate(circuit, 'CNOT', { column: 1, qubit: 0 })));
    ({ circuit } = ok(placeGate(circuit, 'CNOT', { column: 2, qubit: 1 })));
    expect(circuit.columns).toEqual([
      [{ gate: 'H', targets: [0] }],
      [{ gate: 'X', controls: [0], targets: [1] }],
      [{ gate: 'X', controls: [1], targets: [2] }],
    ]);

    const crowded = ok(placeGate(circuit, 'Z', { column: 1, qubit: 1 }));
    expect(crowded.circuit.columns[1]).toEqual([{ gate: 'Z', targets: [1] }]);
    expect(crowded.circuit.columns).toHaveLength(4);
    expect(crowded.at).toEqual({ column: 1, index: 0 });
  });

  it('moves one part within a column, or the whole gate to another column', () => {
    const circuit: Circuit = { qubits: 3, columns: [[{ gate: 'X', controls: [0], targets: [1] }]] };

    expect(ok(movePart(circuit, { column: 0, index: 0, qubit: 0 }, { column: 0, qubit: 1 })).circuit.columns).toEqual([
      [{ gate: 'X', controls: [1], targets: [0] }],
    ]);
    const moved = ok(movePart(circuit, { column: 0, index: 0, qubit: 1 }, { column: 3, qubit: 2 }));
    expect(moved.circuit.columns).toEqual([[{ gate: 'X', controls: [1], targets: [2] }]]);
    expect(moved.at).toEqual({ column: 0, index: 0 });
  });

  it('rejects edits that break the circuit rules', () => {
    const measured: Circuit = { qubits: 1, columns: [[{ gate: 'M', targets: [0] }]] };
    expect(placeGate(measured, 'H', { column: 1, qubit: 0 })).toMatchObject({ ok: true });
    expect(placeGate(measured, 'CNOT', { column: 0, qubit: 0 })).toEqual({ ok: false, error: 'too-few-qubits' });
  });

  it('removes a qubit with its gates and renumbers the rest', () => {
    const circuit: Circuit = {
      qubits: 3,
      columns: [[{ gate: 'H', targets: [0] }, { gate: 'X', targets: [2] }], [{ gate: 'Z', controls: [0], targets: [1] }]],
    };
    expect(ok(removeQubit(circuit, 1)).circuit).toEqual({ qubits: 2, columns: [[{ gate: 'H', targets: [0] }, { gate: 'X', targets: [1] }]] });
  });

  it('sets and clears a condition, and drops gates that read a removed qubit', () => {
    const circuit: Circuit = { qubits: 3, columns: [[{ gate: 'M', targets: [1] }], [{ gate: 'X', targets: [2] }]] };
    const conditioned = ok(setCondition(circuit, { column: 1, index: 0 }, { qubit: 1, value: 1 })).circuit;
    expect(conditioned.columns[1][0]).toEqual({ gate: 'X', targets: [2], condition: { qubit: 1, value: 1 } });
    expect(ok(setCondition(conditioned, { column: 1, index: 0 }, null)).circuit).toEqual(circuit);
    expect(setCondition(circuit, { column: 0, index: 0 }, { qubit: 1, value: 1 })).toEqual({ ok: false, error: 'condition' });
    expect(ok(removeQubit(conditioned, 1)).circuit).toEqual({ qubits: 2, columns: [] });
    expect(ok(removeQubit(conditioned, 0)).circuit.columns[1][0]).toEqual({ gate: 'X', targets: [1], condition: { qubit: 0, value: 1 } });
  });

  it('clears conditions that lose their measurement when it is deleted or moved', () => {
    const circuit: Circuit = {
      qubits: 3,
      columns: [[{ gate: 'M', targets: [1] }], [{ gate: 'X', targets: [2], condition: { qubit: 1, value: 1 } }]],
    };
    expect(ok(removeOperation(circuit, { column: 0, index: 0 })).circuit).toEqual({ qubits: 3, columns: [[{ gate: 'X', targets: [2] }]] });
    const moved = ok(movePart(circuit, { column: 0, index: 0, qubit: 1 }, { column: 0, qubit: 0 })).circuit;
    expect(moved.columns[1][0]).toEqual({ gate: 'X', targets: [2] });
  });
  it('keeps the noise through edits, snaps rates to 0.1% and drops all-zero noise', () => {
    const noise = { oneQubit: 0.01, twoQubit: 0.02, readout: 0.03 };
    const { circuit } = ok(placeGate({ ...empty, noise }, 'H', { column: 0, qubit: 0 }));
    expect(circuit.noise).toEqual(noise);
    expect(ok(removeOperation(circuit, { column: 0, index: 0 })).circuit.noise).toEqual(noise);
    expect(ok(setNoise(empty, { oneQubit: 0.01234, twoQubit: 0, readout: 0 })).circuit.noise).toEqual({ oneQubit: 0.012, twoQubit: 0, readout: 0 });
    expect(ok(setNoise({ ...empty, noise }, { oneQubit: 0, twoQubit: 0, readout: 0 })).circuit).toEqual(empty);
  });
});
