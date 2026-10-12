/** The most qubits a circuit can have; above BROWSER_QUBITS, only quantum-lab's Qiskit Aer runs it. */
export const MAX_QUBITS = 24;
export const BROWSER_QUBITS = 12;

export type GateName =
  | 'H' | 'X' | 'Y' | 'Z'
  | 'S' | 'Sdg' | 'T' | 'Tdg'
  | 'RX' | 'RY' | 'RZ' | 'P'
  | 'SWAP' | 'M';

/** CNOT is X with one control, Toffoli is X with two, CZ is Z with one. Angles are in radians. */
export interface Operation {
  gate: GateName;
  targets: number[];
  controls?: number[];
  angle?: number;
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
}

const single: GateRule = { targets: 1, maxControls: 0, angle: false };
const rotation: GateRule = { targets: 1, maxControls: 0, angle: true };

export const GATE_RULES: Record<GateName, GateRule> = {
  H: single,
  X: { targets: 1, maxControls: 2, angle: false },
  Y: single,
  Z: { targets: 1, maxControls: 1, angle: false },
  S: single,
  Sdg: single,
  T: single,
  Tdg: single,
  RX: rotation,
  RY: rotation,
  RZ: rotation,
  P: rotation,
  SWAP: { targets: 2, maxControls: 0, angle: false },
  M: { targets: 'any', maxControls: 0, angle: false },
};

export type CircuitErrorCode =
  | 'qubit-count'
  | 'unknown-gate'
  | 'target-count'
  | 'control-count'
  | 'angle'
  | 'qubit-range'
  | 'qubit-overlap'
  | 'after-measure';

export interface CircuitError {
  code: CircuitErrorCode;
  column?: number;
  operation?: number;
}

export function operationQubits(op: Operation): number[] {
  return [...(op.controls ?? []), ...op.targets];
}

export function validateCircuit(circuit: Circuit): CircuitError[] {
  const errors: CircuitError[] = [];
  const { qubits } = circuit;
  if (!Number.isInteger(qubits) || qubits < 1 || qubits > MAX_QUBITS) {
    return [{ code: 'qubit-count' }];
  }

  // Mid-circuit measurement is out of scope for 0.1, so the simulator can treat M as terminal.
  const measured = new Set<number>();

  circuit.columns.forEach((column, c) => {
    const used = new Set<number>();
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
        if (used.has(q)) fail('qubit-overlap');
        if (measured.has(q)) fail('after-measure');
        used.add(q);
      }
      if (op.gate === 'M') measuredHere.push(...op.targets);
    });

    measuredHere.forEach((q) => measured.add(q));
  });

  return errors;
}

/** Equal circuits, whatever order their objects' keys were written in. */
export function sameCircuit(a: Circuit, b: Circuit): boolean {
  const canonical = (circuit: Circuit) =>
    JSON.stringify(circuit, (_, value) => (value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([x], [y]) => (x < y ? -1 : 1))) : value));
  return canonical(a) === canonical(b);
}
