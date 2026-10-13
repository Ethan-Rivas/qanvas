import { DENSITY_QUBITS, gateError, operationQubits, partwayMeasurements, type Circuit, type Condition, type Noise, type Operation } from '../circuit/model';
import { applySingle, applySwap, conjugate, gateMatrix, mask, type Amplitudes, type Matrix2 } from './kernels';

/** ρ in Qanvas's index order (q0 is the most significant bit), row-major: entry (i, j) is at i·2ⁿ + j. */
export interface DensityMatrix {
  qubits: number;
  re: Float64Array;
  im: Float64Array;
  mixed: true;
}

/**
 * Seen as a 2n-qubit vector, ρ's row index is qubits 0…n−1 and its column index is n…2n−1,
 * so UρU† is U on the row qubits followed by conj(U) on the column qubits.
 */
function asVector(rho: DensityMatrix): Amplitudes {
  return { qubits: 2 * rho.qubits, re: rho.re, im: rho.im };
}

/** `controls` are qubits; `columnBits` are bits of the 2n-qubit vector that control both sides. */
function applyUnitary(rho: DensityMatrix, m: Matrix2, target: number, controls: number[], columnBits: number[] = []) {
  const n = rho.qubits;
  applySingle(asVector(rho), m, target, [...controls, ...columnBits]);
  applySingle(asVector(rho), conjugate(m), n + target, [...controls.map((c) => n + c), ...columnBits]);
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

/**
 * Splits off the part of a just-measured qubit whose reading came out wrong. The measurement left ρ with no
 * entries between the qubit's 0 and 1, so they hold that part: entry (i, j) means the qubit has i's value and
 * the reading says j's. Gates on other qubits treat both parts alike, and a condition reads j, the column.
 */
function misread(rho: DensityMatrix, qubit: number, readout: number) {
  const dim = 1 << rho.qubits;
  const m = mask(qubit, rho.qubits);
  for (let i = 0; i < dim; i++) {
    for (let j = 0; j < dim; j++) {
      if ((i ^ j) & m) continue;
      const right = i * dim + j;
      const wrong = i * dim + (j ^ m);
      rho.re[wrong] = readout * rho.re[right];
      rho.im[wrong] = readout * rho.im[right];
      rho.re[right] *= 1 - readout;
      rho.im[right] *= 1 - readout;
    }
  }
}

/** Adds the wrong-reading part back onto the qubit's own value, once no condition can read that measurement. */
function merge(rho: DensityMatrix, qubit: number) {
  const dim = 1 << rho.qubits;
  const m = mask(qubit, rho.qubits);
  for (let i = 0; i < dim; i++) {
    for (let j = 0; j < dim; j++) {
      if (!((i ^ j) & m)) continue;
      const wrong = i * dim + j;
      const right = i * dim + (j ^ m);
      rho.re[right] += rho.re[wrong];
      rho.im[right] += rho.im[wrong];
      rho.re[wrong] = 0;
      rho.im[wrong] = 0;
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

/**
 * ρ → (1 − p)ρ + p·Tr_S(ρ) ⊗ I/2ᵏ on the k qubits S, Qiskit's depolarizing_error(p, k). With a condition,
 * only where the reading (the column bit, see `misread`) matches, so a gate that doesn't run adds no noise.
 */
function depolarize(rho: DensityMatrix, qubits: number[], p: number, condition?: Condition) {
  const n = rho.qubits;
  const dim = 1 << n;
  const offsets = Array.from({ length: 1 << qubits.length }, (_, s) => qubits.reduce((acc, q, b) => ((s >> b) & 1 ? acc | mask(q, n) : acc), 0));
  const touched = offsets[offsets.length - 1];
  const read = condition ? mask(condition.qubit, n) : 0;
  const share = p / offsets.length;
  for (let i = 0; i < dim; i++) {
    if (i & touched) continue;
    for (let j = 0; j < dim; j++) {
      if (j & touched) continue;
      if (condition && ((j & read) !== 0) !== (condition.value === 1)) continue;
      let traceRe = 0;
      let traceIm = 0;
      for (const o of offsets) {
        traceRe += rho.re[(i | o) * dim + (j | o)];
        traceIm += rho.im[(i | o) * dim + (j | o)];
      }
      for (const a of offsets) {
        for (const b of offsets) {
          const at = (i | a) * dim + (j | b);
          rho.re[at] = (1 - p) * rho.re[at] + (a === b ? share * traceRe : 0);
          rho.im[at] = (1 - p) * rho.im[at] + (a === b ? share * traceIm : 0);
        }
      }
    }
  }
}

const X = gateMatrix('X');

/** Runs `apply` where the reading of `condition.qubit` matches; `apply` gets the column bit that holds the reading. */
function whereRead(rho: DensityMatrix, condition: Condition, apply: (bit: number) => void) {
  const bit = rho.qubits + condition.qubit;
  if (condition.value === 0) applySingle(asVector(rho), X, bit, []);
  apply(bit);
  if (condition.value === 0) applySingle(asVector(rho), X, bit, []);
}

function applyGate(rho: DensityMatrix, op: Operation, noise: Noise | undefined) {
  if (op.gate === 'RESET') return reset(rho, op.targets[0]);
  if (op.gate === 'SWAP') {
    applySwap(asVector(rho), op.targets[0], op.targets[1]);
    applySwap(asVector(rho), rho.qubits + op.targets[0], rho.qubits + op.targets[1]);
  } else {
    const m = gateMatrix(op.gate, op.angle);
    if (op.condition) whereRead(rho, op.condition, (bit) => applyUnitary(rho, m, op.targets[0], [], [bit]));
    else applyUnitary(rho, m, op.targets[0], op.controls ?? []);
  }
  const error = gateError(op, noise);
  if (error > 0) depolarize(rho, operationQubits(op), error, op.condition);
}

/**
 * Writes the density matrix before any column, then after each one, into `re` and `im` (step k at k·4ⁿ),
 * so a long circuit keeps a single copy of each snapshot. Snapshots show the state with misread parts merged.
 */
export function simulateDensity(circuit: Circuit, re: Float64Array, im: Float64Array): void {
  if (circuit.qubits > DENSITY_QUBITS) throw new Error(`The density-matrix simulator works with up to ${DENSITY_QUBITS} qubits`);
  const n = circuit.qubits;
  const size = 1 << (2 * n);
  const partway = partwayMeasurements(circuit);
  const readout = circuit.noise?.readout ?? 0;
  const rho: DensityMatrix = { qubits: n, re: new Float64Array(size), im: new Float64Array(size), mixed: true };
  rho.re[0] = 1;
  const misreadQubits = new Set<number>();

  const save = (step: number) => {
    const snapshot: DensityMatrix = { qubits: n, re: re.subarray(step * size, (step + 1) * size), im: im.subarray(step * size, (step + 1) * size), mixed: true };
    snapshot.re.set(rho.re);
    snapshot.im.set(rho.im);
    misreadQubits.forEach((q) => merge(snapshot, q));
  };

  save(0);
  circuit.columns.forEach((column, c) => {
    for (const op of column) {
      for (const q of operationQubits(op)) if (misreadQubits.delete(q)) merge(rho, q);
      if (op.gate !== 'M') {
        applyGate(rho, op, circuit.noise);
        continue;
      }
      for (const q of op.targets) {
        if (!partway.has(`${c}:${q}`)) continue;
        dephase(rho, q);
        if (readout > 0) {
          misread(rho, q, readout);
          misreadQubits.add(q);
        }
      }
    }
    save(c + 1);
  });
}
