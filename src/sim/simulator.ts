import { validateCircuit, type Circuit, type GateName, type Operation } from '../circuit/model';

/**
 * Amplitudes indexed so that q0 is the most significant bit: index 0b100 on three qubits is |100⟩
 * with q0 = 1, matching how Qanvas writes kets. Qiskit uses the opposite order.
 */
export interface StateVector {
  qubits: number;
  re: Float64Array;
  im: Float64Array;
}

/** Row-major 2×2 complex matrix: [a, b, c, d] as separate real and imaginary parts. */
interface Matrix2 {
  re: [number, number, number, number];
  im: [number, number, number, number];
}

const R = Math.SQRT1_2;
const C8 = Math.cos(Math.PI / 4);

const FIXED: Partial<Record<GateName, Matrix2>> = {
  H: { re: [R, R, R, -R], im: [0, 0, 0, 0] },
  X: { re: [0, 1, 1, 0], im: [0, 0, 0, 0] },
  Y: { re: [0, 0, 0, 0], im: [0, -1, 1, 0] },
  Z: { re: [1, 0, 0, -1], im: [0, 0, 0, 0] },
  S: { re: [1, 0, 0, 0], im: [0, 0, 0, 1] },
  Sdg: { re: [1, 0, 0, 0], im: [0, 0, 0, -1] },
  T: { re: [1, 0, 0, C8], im: [0, 0, 0, C8] },
  Tdg: { re: [1, 0, 0, C8], im: [0, 0, 0, -C8] },
};

function gateMatrix(gate: GateName, angle = 0): Matrix2 {
  const fixed = FIXED[gate];
  if (fixed) return fixed;
  const c = Math.cos(angle / 2);
  const s = Math.sin(angle / 2);
  switch (gate) {
    case 'RX':
      return { re: [c, 0, 0, c], im: [0, -s, -s, 0] };
    case 'RY':
      return { re: [c, -s, s, c], im: [0, 0, 0, 0] };
    case 'RZ':
      return { re: [c, 0, 0, c], im: [-s, 0, 0, s] };
    case 'P':
      return { re: [1, 0, 0, Math.cos(angle)], im: [0, 0, 0, Math.sin(angle)] };
    default:
      throw new Error(`No matrix for gate ${gate}`);
  }
}

function mask(qubit: number, qubits: number): number {
  return 1 << (qubits - 1 - qubit);
}

export function zeroState(qubits: number): StateVector {
  const re = new Float64Array(1 << qubits);
  re[0] = 1;
  return { qubits, re, im: new Float64Array(1 << qubits) };
}

function cloneState(state: StateVector): StateVector {
  return { qubits: state.qubits, re: state.re.slice(), im: state.im.slice() };
}

function applySingle(state: StateVector, m: Matrix2, target: number, controls: number[]) {
  const { re, im, qubits } = state;
  const t = mask(target, qubits);
  const cMask = controls.reduce((acc, q) => acc | mask(q, qubits), 0);
  const [ar, br, cr, dr] = m.re;
  const [ai, bi, ci, di] = m.im;

  for (let i = 0; i < re.length; i++) {
    if (i & t || (i & cMask) !== cMask) continue;
    const j = i | t;
    const r0 = re[i], i0 = im[i], r1 = re[j], i1 = im[j];
    re[i] = ar * r0 - ai * i0 + br * r1 - bi * i1;
    im[i] = ar * i0 + ai * r0 + br * i1 + bi * r1;
    re[j] = cr * r0 - ci * i0 + dr * r1 - di * i1;
    im[j] = cr * i0 + ci * r0 + dr * i1 + di * r1;
  }
}

function applySwap(state: StateVector, a: number, b: number) {
  const { re, im, qubits } = state;
  const ma = mask(a, qubits);
  const mb = mask(b, qubits);
  for (let i = 0; i < re.length; i++) {
    if (i & ma || !(i & mb)) continue;
    const j = i ^ ma ^ mb;
    [re[i], re[j]] = [re[j], re[i]];
    [im[i], im[j]] = [im[j], im[i]];
  }
}

function applyOperation(state: StateVector, op: Operation) {
  switch (op.gate) {
    // Measurements are always terminal (see validateCircuit), so they leave the state as is;
    // the outcome probabilities are read from the final state.
    case 'M':
      return;
    case 'SWAP':
      return applySwap(state, op.targets[0], op.targets[1]);
    default:
      return applySingle(state, gateMatrix(op.gate, op.angle), op.targets[0], op.controls ?? []);
  }
}

/** Returns the state before any column, then after each column: `columns.length + 1` states. */
export function simulate(circuit: Circuit): StateVector[] {
  const errors = validateCircuit(circuit);
  if (errors.length > 0) {
    throw new Error(`Invalid circuit: ${errors.map((e) => e.code).join(', ')}`);
  }

  const states = [zeroState(circuit.qubits)];
  for (const column of circuit.columns) {
    const state = cloneState(states[states.length - 1]);
    for (const op of column) applyOperation(state, op);
    states.push(state);
  }
  return states;
}

export function finalState(circuit: Circuit): StateVector {
  const states = simulate(circuit);
  return states[states.length - 1];
}

export function probabilities(state: StateVector): Float64Array {
  const p = new Float64Array(state.re.length);
  for (let i = 0; i < p.length; i++) p[i] = state.re[i] ** 2 + state.im[i] ** 2;
  return p;
}
