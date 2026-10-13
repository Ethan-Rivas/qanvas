/** The most qubits a circuit can have; above BROWSER_QUBITS, only quantum-lab's Qiskit Aer runs it. */
export const MAX_QUBITS = 24;
export const BROWSER_QUBITS = 12;
/** Dynamic circuits are simulated as a density matrix, with 4ⁿ entries instead of 2ⁿ. */
export const DENSITY_QUBITS = 8;

export type GateName =
  | 'H' | 'X' | 'Y' | 'Z'
  | 'S' | 'Sdg' | 'T' | 'Tdg'
  | 'RX' | 'RY' | 'RZ' | 'P'
  | 'SWAP' | 'M' | 'RESET';

/** The gate runs only when `qubit`'s latest measurement gave `value`. */
export interface Condition {
  qubit: number;
  value: 0 | 1;
}

/** CNOT is X with one control, Toffoli is X with two, CZ is Z with one. Angles are in radians. */
export interface Operation {
  gate: GateName;
  targets: number[];
  controls?: number[];
  angle?: number;
  condition?: Condition;
}

/** Each column holds operations that run at the same time, on distinct qubits. */
export interface Circuit {
  qubits: number;
  columns: Operation[][];
}

interface GateRule {
  targets: number | 'any';
  maxControls: number;
  angle: boolean;
  conditional: boolean;
}

const single: GateRule = { targets: 1, maxControls: 0, angle: false, conditional: true };
const rotation: GateRule = { targets: 1, maxControls: 0, angle: true, conditional: true };

export const GATE_RULES: Record<GateName, GateRule> = {
  H: single,
  X: { targets: 1, maxControls: 2, angle: false, conditional: true },
  Y: single,
  Z: { targets: 1, maxControls: 1, angle: false, conditional: true },
  S: single,
  Sdg: single,
  T: single,
  Tdg: single,
  RX: rotation,
  RY: rotation,
  RZ: rotation,
  P: rotation,
  SWAP: { targets: 2, maxControls: 0, angle: false, conditional: false },
  M: { targets: 'any', maxControls: 0, angle: false, conditional: false },
  RESET: { targets: 1, maxControls: 0, angle: false, conditional: false },
};

export type CircuitErrorCode =
  | 'qubit-count'
  | 'unknown-gate'
  | 'target-count'
  | 'control-count'
  | 'angle'
  | 'qubit-range'
  | 'qubit-overlap'
  | 'condition';

export interface CircuitError {
  code: CircuitErrorCode;
  column?: number;
  operation?: number;
}

export function operationQubits(op: Operation): number[] {
  return [...(op.controls ?? []), ...op.targets];
}

export function referencedQubits(op: Operation): number[] {
  return op.condition ? [...operationQubits(op), op.condition.qubit] : operationQubits(op);
}

/** Qubits measured before `column` and left alone since, which a gate in `column` can be conditioned on. */
export function readableQubits(circuit: Circuit, column: number): number[] {
  const readable = new Set<number>();
  for (const ops of circuit.columns.slice(0, column)) {
    ops.flatMap(operationQubits).forEach((q) => readable.delete(q));
    ops.forEach((op) => op.gate === 'M' && op.targets.forEach((q) => readable.add(q)));
  }
  return [...readable].sort((a, b) => a - b);
}

export function validateCircuit(circuit: Circuit): CircuitError[] {
  const errors: CircuitError[] = [];
  const { qubits } = circuit;
  if (!Number.isInteger(qubits) || qubits < 1 || qubits > MAX_QUBITS) {
    return [{ code: 'qubit-count' }];
  }

  const readable = new Set<number>();

  circuit.columns.forEach((column, c) => {
    const used = new Set<number>();
    const read = new Set<number>();
    const measuredHere: number[] = [];

    column.forEach((op, o) => {
      const fail = (code: CircuitErrorCode) => errors.push({ code, column: c, operation: o });
      const rule = Object.hasOwn(GATE_RULES, op.gate) ? GATE_RULES[op.gate] : undefined;
      if (!rule) return fail('unknown-gate');

      const controls = op.controls ?? [];
      if (rule.targets === 'any' ? op.targets.length < 1 : op.targets.length !== rule.targets) {
        fail('target-count');
      }
      if (controls.length > rule.maxControls) fail('control-count');
      if (rule.angle !== (op.angle !== undefined) || (op.angle !== undefined && !Number.isFinite(op.angle))) {
        fail('angle');
      }

      for (const q of operationQubits(op)) {
        if (!Number.isInteger(q) || q < 0 || q >= qubits) {
          fail('qubit-range');
          continue;
        }
        if (read.has(q)) fail('condition');
        else if (used.has(q)) fail('qubit-overlap');
        used.add(q);
      }

      const condition: unknown = op.condition;
      if (condition !== undefined) {
        const { qubit, value } = (condition ?? {}) as Partial<Condition>;
        const valid =
          typeof condition === 'object' && condition !== null && rule.conditional && controls.length === 0 &&
          (value === 0 || value === 1) && qubit !== undefined && readable.has(qubit) && !used.has(qubit);
        if (!valid) fail('condition');
        else read.add(qubit);
      }
      if (op.gate === 'M') measuredHere.push(...op.targets);
    });

    used.forEach((q) => readable.delete(q));
    measuredHere.forEach((q) => readable.add(q));
  });

  return errors;
}

/**
 * Measurements whose qubit is used again later, as `column:qubit` keys. A terminal measurement
 * isn't listed: it doesn't change the outcome probabilities, so the simulator leaves the state as is.
 */
export function partwayMeasurements(circuit: Circuit): Set<string> {
  const marked = new Set<string>();
  const usedLater = new Set<number>();
  for (let c = circuit.columns.length - 1; c >= 0; c--) {
    for (const op of circuit.columns[c]) {
      if (op.gate === 'M') op.targets.forEach((q) => usedLater.has(q) && marked.add(`${c}:${q}`));
    }
    for (const op of circuit.columns[c]) referencedQubits(op).forEach((q) => usedLater.add(q));
  }
  return marked;
}

/** A dynamic circuit resets a qubit or measures one partway through, so it needs the density-matrix simulator. */
export function isDynamic(circuit: Circuit): boolean {
  return circuit.columns.some((column) => column.some((op) => op.gate === 'RESET')) || partwayMeasurements(circuit).size > 0;
}

/** Equal circuits, whatever order their objects' keys were written in. */
export function sameCircuit(a: Circuit, b: Circuit): boolean {
  const canonical = (circuit: Circuit) =>
    JSON.stringify(circuit, (_, value) => (value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([x], [y]) => (x < y ? -1 : 1))) : value));
  return canonical(a) === canonical(b);
}
