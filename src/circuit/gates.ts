import type { GateName, Operation } from './model';

/** What the palette offers. Several kinds share a model gate: CNOT and Toffoli are controlled X, CZ is controlled Z. */
export type GateKind =
  | 'H' | 'X' | 'Y' | 'Z'
  | 'S' | 'Sdg' | 'T' | 'Tdg' | 'P'
  | 'RX' | 'RY' | 'RZ'
  | 'CNOT' | 'CZ' | 'SWAP' | 'CCX'
  | 'M' | 'RESET';

export type GateFamily = 'hadamard' | 'pauli' | 'phase' | 'rotation' | 'multi' | 'measure';

export const GATE_FAMILY: Record<GateKind, GateFamily> = {
  H: 'hadamard',
  X: 'pauli',
  Y: 'pauli',
  Z: 'pauli',
  S: 'phase',
  Sdg: 'phase',
  T: 'phase',
  Tdg: 'phase',
  P: 'phase',
  RX: 'rotation',
  RY: 'rotation',
  RZ: 'rotation',
  CNOT: 'multi',
  CZ: 'multi',
  SWAP: 'multi',
  CCX: 'multi',
  M: 'measure',
  RESET: 'measure',
};

export const GATE_SYMBOL: Record<GateKind, string> = {
  H: 'H',
  X: 'X',
  Y: 'Y',
  Z: 'Z',
  S: 'S',
  Sdg: 'S†',
  T: 'T',
  Tdg: 'T†',
  P: 'P',
  RX: 'Rx',
  RY: 'Ry',
  RZ: 'Rz',
  CNOT: 'CNOT',
  CZ: 'CZ',
  SWAP: 'SWAP',
  CCX: 'CCX',
  M: 'M',
  RESET: '|0⟩',
};

const DEFAULT_ANGLE = Math.PI / 2;

export function qubitsNeeded(kind: GateKind): number {
  if (kind === 'CCX') return 3;
  if (kind === 'CNOT' || kind === 'CZ' || kind === 'SWAP') return 2;
  return 1;
}

export function hasAngle(kind: GateKind): boolean {
  return kind === 'RX' || kind === 'RY' || kind === 'RZ' || kind === 'P';
}

export function kindOf(op: Operation): GateKind {
  const controls = op.controls?.length ?? 0;
  if (op.gate === 'X' && controls === 2) return 'CCX';
  if (op.gate === 'X' && controls === 1) return 'CNOT';
  if (op.gate === 'Z' && controls === 1) return 'CZ';
  return op.gate;
}

/**
 * Builds the operation a palette gate becomes when dropped on `qubit`. Multi-qubit gates also take
 * the qubit right below the drop point, or the one above when there's no room below.
 */
export function createOperation(kind: GateKind, qubit: number, qubits: number): Operation {
  const other = qubit + 1 < qubits ? qubit + 1 : qubit - 1;
  switch (kind) {
    case 'CNOT':
      return { gate: 'X', controls: [qubit], targets: [other] };
    case 'CZ':
      return { gate: 'Z', controls: [qubit], targets: [other] };
    case 'SWAP':
      return { gate: 'SWAP', targets: [qubit, other] };
    case 'CCX': {
      const first = Math.min(qubit, qubits - 3);
      return { gate: 'X', controls: [first, first + 1], targets: [first + 2] };
    }
    default: {
      const gate = kind as GateName;
      return hasAngle(kind) ? { gate, targets: [qubit], angle: DEFAULT_ANGLE } : { gate, targets: [qubit] };
    }
  }
}
