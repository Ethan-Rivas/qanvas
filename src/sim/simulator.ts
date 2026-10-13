import { isDynamic, validateCircuit, type Circuit, type Operation } from '../circuit/model';
import { simulateDensity, type DensityMatrix } from './density';
import { applySingle, applySwap, gateMatrix } from './kernels';

export type { DensityMatrix } from './density';

/**
 * Amplitudes indexed so that q0 is the most significant bit: index 0b100 on three qubits is |100⟩
 * with q0 = 1, matching how Qanvas writes kets. Qiskit uses the opposite order.
 */
export interface StateVector {
  qubits: number;
  re: Float64Array;
  im: Float64Array;
}

export function zeroState(qubits: number): StateVector {
  const re = new Float64Array(1 << qubits);
  re[0] = 1;
  return { qubits, re, im: new Float64Array(1 << qubits) };
}

function cloneState(state: StateVector): StateVector {
  return { qubits: state.qubits, re: state.re.slice(), im: state.im.slice() };
}

export type QuantumState = StateVector | DensityMatrix;

export function isMixed(state: QuantumState): state is DensityMatrix {
  return 'mixed' in state;
}

function applyOperation(state: StateVector, op: Operation) {
  switch (op.gate) {
    // Only static circuits get here, where measurements are terminal, so they leave the state as is;
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
export function simulate(circuit: Circuit): QuantumState[] {
  const errors = validateCircuit(circuit);
  if (errors.length > 0) {
    throw new Error(`Invalid circuit: ${errors.map((e) => e.code).join(', ')}`);
  }
  if (isDynamic(circuit)) return simulateDensity(circuit);

  const states = [zeroState(circuit.qubits)];
  for (const column of circuit.columns) {
    const state = cloneState(states[states.length - 1]);
    for (const op of column) applyOperation(state, op);
    states.push(state);
  }
  return states;
}

export function finalState(circuit: Circuit): QuantumState {
  const states = simulate(circuit);
  return states[states.length - 1];
}

export function probabilities(state: QuantumState): Float64Array {
  const dim = 1 << state.qubits;
  const p = new Float64Array(dim);
  if (isMixed(state)) for (let i = 0; i < dim; i++) p[i] = state.re[i * dim + i];
  else for (let i = 0; i < dim; i++) p[i] = state.re[i] ** 2 + state.im[i] ** 2;
  return p;
}
