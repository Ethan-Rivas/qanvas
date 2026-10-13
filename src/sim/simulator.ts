import { usesDensity, validateCircuit, type Circuit, type Operation } from '../circuit/model';
import { reportedDensityProbabilities, simulateDensity, type DensityMatrix } from './density';
import { applySingle, applySwap, gateMatrix, withReadout } from './kernels';

export { withReadout } from './kernels';

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

/** Every step's state, one after another: the state before any column, then after each one. */
export interface Simulation {
  qubits: number;
  mixed: boolean;
  re: Float64Array;
  im: Float64Array;
}

function stateSize(qubits: number, mixed: boolean): number {
  return mixed ? 1 << (2 * qubits) : 1 << qubits;
}

/** A view of one step's state inside the simulation's buffers; steps past the end give the last one. */
export function stateAt(simulation: Simulation, step: number): QuantumState {
  const { qubits, mixed } = simulation;
  const size = stateSize(qubits, mixed);
  const k = Math.min(step, simulation.re.length / size - 1);
  const re = simulation.re.subarray(k * size, (k + 1) * size);
  const im = simulation.im.subarray(k * size, (k + 1) * size);
  return mixed ? { qubits, re, im, mixed: true } : { qubits, re, im };
}

export function simulateSteps(circuit: Circuit): Simulation {
  const errors = validateCircuit(circuit);
  if (errors.length > 0) {
    throw new Error(`Invalid circuit: ${errors.map((e) => e.code).join(', ')}`);
  }
  const { qubits } = circuit;
  const mixed = usesDensity(circuit);
  const size = stateSize(qubits, mixed);
  const re = new Float64Array((circuit.columns.length + 1) * size);
  const im = new Float64Array(re.length);
  if (mixed) {
    simulateDensity(circuit, re, im);
  } else {
    re[0] = 1;
    circuit.columns.forEach((column, c) => {
      re.copyWithin((c + 1) * size, c * size, (c + 1) * size);
      im.copyWithin((c + 1) * size, c * size, (c + 1) * size);
      const state = stateAt({ qubits, mixed, re, im }, c + 1) as StateVector;
      for (const op of column) applyOperation(state, op);
    });
  }
  return { qubits, mixed, re, im };
}

/** Returns the state before any column, then after each column: `columns.length + 1` states. */
export function simulate(circuit: Circuit): QuantumState[] {
  const simulation = simulateSteps(circuit);
  return Array.from({ length: circuit.columns.length + 1 }, (_, k) => stateAt(simulation, k));
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

/**
 * What a run of the circuit reports when every qubit is read at the end, with the recorded bit for
 * measurements that conditions read; the chart instead shows what measuring the final state would give.
 */
export function reportedProbabilities(circuit: Circuit): Float64Array {
  if (usesDensity(circuit)) return reportedDensityProbabilities(circuit);
  return withReadout(probabilities(finalState(circuit)), circuit.qubits, circuit.noise?.readout ?? 0);
}
