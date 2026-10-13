import { createOperation, qubitsNeeded, type GateKind } from './gates';
import {
  MAX_QUBITS,
  operationQubits,
  readableQubits,
  referencedQubits,
  validateCircuit,
  type Circuit,
  type CircuitErrorCode,
  type Condition,
  type Operation,
} from './model';

export interface OpLocation {
  column: number;
  index: number;
}

export interface Cell {
  column: number;
  qubit: number;
}

export type EditError = CircuitErrorCode | 'too-few-qubits' | 'too-many-qubits';

/** On success, `at` is where the edited operation ended up, when there still is one. */
export type EditResult =
  | { ok: true; circuit: Circuit; at?: OpLocation }
  | { ok: false; error: EditError };

function remap(op: Operation, f: (q: number) => number): Operation {
  return { ...op, targets: op.targets.map(f), ...(op.controls && { controls: op.controls.map(f) }) };
}

function fits(column: Operation[], op: Operation): boolean {
  const used = new Set(column.flatMap(referencedQubits));
  return referencedQubits(op).every((q) => !used.has(q));
}

/** Adds `op` to the column, or opens a new column there when its qubits are taken. */
function insert(columns: Operation[][], op: Operation, column: number): OpLocation {
  if (column >= columns.length) {
    columns.push([op]);
    return { column: columns.length - 1, index: 0 };
  }
  if (fits(columns[column], op)) {
    columns[column].push(op);
    return { column, index: columns[column].length - 1 };
  }
  columns.splice(column, 0, [op]);
  return { column, index: 0 };
}

function finish(qubits: number, columns: Operation[][], at?: OpLocation): EditResult {
  const removedBefore = at ? columns.slice(0, at.column).filter((c) => c.length === 0).length : 0;
  const circuit = { qubits, columns: columns.filter((c) => c.length > 0) };
  const error = validateCircuit(circuit)[0];
  if (error) return { ok: false, error: error.code };
  return { ok: true, circuit, at: at && { column: at.column - removedBefore, index: at.index } };
}

function clearOrphanConditions(qubits: number, columns: Operation[][]): void {
  columns.forEach((column, c) => {
    const readable = readableQubits({ qubits, columns }, c);
    const busy = column.flatMap(operationQubits);
    column.forEach((op, i) => {
      if (op.condition && (!readable.includes(op.condition.qubit) || busy.includes(op.condition.qubit))) {
        const { condition: _, ...unconditioned } = op;
        column[i] = unconditioned;
      }
    });
  });
}

function copyColumns(circuit: Circuit): Operation[][] {
  return circuit.columns.map((column) => [...column]);
}

export function placeGate(circuit: Circuit, kind: GateKind, cell: Cell): EditResult {
  if (circuit.qubits < qubitsNeeded(kind)) return { ok: false, error: 'too-few-qubits' };
  const columns = copyColumns(circuit);
  const at = insert(columns, createOperation(kind, cell.qubit, circuit.qubits), cell.column);
  return finish(circuit.qubits, columns, at);
}

export function pasteOperation(circuit: Circuit, op: Operation, column: number): EditResult {
  if (operationQubits(op).some((q) => q >= circuit.qubits)) return { ok: false, error: 'too-few-qubits' };
  const columns = copyColumns(circuit);
  return finish(circuit.qubits, columns, insert(columns, op, column));
}

/**
 * Moves one part of an operation (a control, target or SWAP leg on `from.qubit`) to `to`.
 * Within the same column only that part moves, swapping places with another part of the
 * same gate if it lands on one; in another column the whole gate moves and keeps its shape.
 */
export function movePart(circuit: Circuit, from: OpLocation & { qubit: number }, to: Cell): EditResult {
  const op = circuit.columns[from.column][from.index];
  if (to.column === from.column && to.qubit === from.qubit) return { ok: true, circuit, at: from };

  let moved: Operation;
  if (to.column === from.column) {
    moved = remap(op, (q) => (q === from.qubit ? to.qubit : q === to.qubit ? from.qubit : q));
  } else {
    const shift = to.qubit - from.qubit;
    moved = remap(op, (q) => q + shift);
    if (operationQubits(moved).some((q) => q < 0 || q >= circuit.qubits)) return { ok: false, error: 'qubit-range' };
  }

  const columns = copyColumns(circuit);
  columns[from.column].splice(from.index, 1);
  const at = insert(columns, moved, to.column);
  clearOrphanConditions(circuit.qubits, columns);
  return finish(circuit.qubits, columns, at);
}

export function removeOperation(circuit: Circuit, at: OpLocation): EditResult {
  const columns = copyColumns(circuit);
  columns[at.column].splice(at.index, 1);
  clearOrphanConditions(circuit.qubits, columns);
  return finish(circuit.qubits, columns);
}

export function setAngle(circuit: Circuit, at: OpLocation, angle: number): EditResult {
  const columns = copyColumns(circuit);
  columns[at.column][at.index] = { ...columns[at.column][at.index], angle };
  return finish(circuit.qubits, columns, at);
}

export function setCondition(circuit: Circuit, at: OpLocation, condition: Condition | null): EditResult {
  const columns = copyColumns(circuit);
  const op = { ...columns[at.column][at.index] };
  delete op.condition;
  if (condition) op.condition = condition;
  columns[at.column][at.index] = op;
  return finish(circuit.qubits, columns, at);
}

export function addQubit(circuit: Circuit, limit = MAX_QUBITS): EditResult {
  if (circuit.qubits >= limit) return { ok: false, error: 'too-many-qubits' };
  return { ok: true, circuit: { ...circuit, qubits: circuit.qubits + 1 } };
}

/** Deletes the qubit and every gate that touches or reads it; the qubits below move up one row. */
export function removeQubit(circuit: Circuit, qubit: number): EditResult {
  if (circuit.qubits <= 1) return { ok: false, error: 'too-few-qubits' };
  const shift = (q: number) => (q > qubit ? q - 1 : q);
  const columns = circuit.columns.map((column) =>
    column
      .filter((op) => !referencedQubits(op).includes(qubit))
      .map((op) => {
        const moved = remap(op, shift);
        return op.condition ? { ...moved, condition: { ...op.condition, qubit: shift(op.condition.qubit) } } : moved;
      }),
  );
  return finish(circuit.qubits - 1, columns);
}
