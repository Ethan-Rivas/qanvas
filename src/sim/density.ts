import { partwayMeasurements, type Circuit, type Operation } from '../circuit/model';
import { applySingle, applySwap, conjugate, gateMatrix, mask, type Amplitudes, type Matrix2 } from './kernels';

/** ρ in Qanvas's index order (q0 is the most significant bit), row-major: entry (i, j) is at i·2ⁿ + j. */
export interface DensityMatrix {
  qubits: number;
  re: Float64Array;
  im: Float64Array;
  mixed: true;
}

function zeroDensity(qubits: number): DensityMatrix {
  const size = 1 << (2 * qubits);
  const re = new Float64Array(size);
  re[0] = 1;
  return { qubits, re, im: new Float64Array(size), mixed: true };
}

/**
 * Seen as a 2n-qubit vector, ρ's row index is qubits 0…n−1 and its column index is n…2n−1,
 * so UρU† is U on the row qubits followed by conj(U) on the column qubits.
 */
function asVector(rho: DensityMatrix): Amplitudes {
  return { qubits: 2 * rho.qubits, re: rho.re, im: rho.im };
}

function applyUnitary(rho: DensityMatrix, m: Matrix2, target: number, controls: number[]) {
  const n = rho.qubits;
  applySingle(asVector(rho), m, target, controls);
  applySingle(asVector(rho), conjugate(m), n + target, controls.map((c) => n + c));
}

/** Removes the coherence between the qubit's 0 and 1: the state after measuring it, before anyone looks. */
function dephase(rho: DensityMatrix, qubit: number) {
  const dim = 1 << rho.qubits;
  const m = mask(qubit, rho.qubits);
  for (let i = 0; i < dim; i++) {
    for (let j = 0; j < dim; j++) {
      if ((i ^ j) & m) {
        rho.re[i * dim + j] = 0;
        rho.im[i * dim + j] = 0;
      }
    }
  }
}

/** ρ → K₀ρK₀† + K₁ρK₁† with K₀ = |0⟩⟨0| and K₁ = |0⟩⟨1|: the |1⟩ block moves onto |0⟩. */
function reset(rho: DensityMatrix, qubit: number) {
  const dim = 1 << rho.qubits;
  const m = mask(qubit, rho.qubits);
  for (let i = 0; i < dim; i++) {
    for (let j = 0; j < dim; j++) {
      const k = i * dim + j;
      if ((i | j) & m) {
        rho.re[k] = 0;
        rho.im[k] = 0;
      } else {
        const from = (i | m) * dim + (j | m);
        rho.re[k] += rho.re[from];
        rho.im[k] += rho.im[from];
      }
    }
  }
}

const X = gateMatrix('X');

function applyOperation(rho: DensityMatrix, op: Operation, measuresPartway: (q: number) => boolean) {
  switch (op.gate) {
    case 'M':
      return op.targets.filter(measuresPartway).forEach((q) => dephase(rho, q));
    case 'RESET':
      return reset(rho, op.targets[0]);
    case 'SWAP':
      applySwap(asVector(rho), op.targets[0], op.targets[1]);
      return applySwap(asVector(rho), rho.qubits + op.targets[0], rho.qubits + op.targets[1]);
  }
  const m = gateMatrix(op.gate, op.angle);
  if (!op.condition) return applyUnitary(rho, m, op.targets[0], op.controls ?? []);
  // validateCircuit guarantees the condition qubit was measured (dephased) and left alone since,
  // so controlling on its 0/1 value acts exactly like conditioning on the measured bit.
  const { qubit, value } = op.condition;
  if (value === 0) applyUnitary(rho, X, qubit, []);
  applyUnitary(rho, m, op.targets[0], [qubit]);
  if (value === 0) applyUnitary(rho, X, qubit, []);
}

/** The density matrix before any column, then after each column: `columns.length + 1` matrices. */
export function simulateDensity(circuit: Circuit): DensityMatrix[] {
  const partway = partwayMeasurements(circuit);
  const states = [zeroDensity(circuit.qubits)];
  circuit.columns.forEach((column, c) => {
    const previous = states[states.length - 1];
    const rho: DensityMatrix = { ...previous, re: previous.re.slice(), im: previous.im.slice() };
    for (const op of column) applyOperation(rho, op, (q) => partway.has(`${c}:${q}`));
    states.push(rho);
  });
  return states;
}
