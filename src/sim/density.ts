import { DENSITY_QUBITS, gateError, operationQubits, partwayMeasurements, type Circuit, type Condition, type Noise, type Operation } from '../circuit/model';
import { applySingle, applySwap, conjugate, gateMatrix, mask, withReadout, type Amplitudes, type Matrix2 } from './kernels';

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
  const { re, im } = rho;
  const offsets = Array.from({ length: 1 << qubits.length }, (_, s) => qubits.reduce((acc, q, b) => ((s >> b) & 1 ? acc | mask(q, n) : acc), 0));
  const touched = offsets[offsets.length - 1];
  const read = condition ? mask(condition.qubit, n) : 0;
  const share = p / offsets.length;
  const keep = 1 - p;
  if (qubits.length === 1) {
    const m = touched;
    for (let i = 0; i < dim; i++) {
      if (i & m) continue;
      for (let j = 0; j < dim; j++) {
        if (j & m) continue;
        if (condition && ((j & read) !== 0) !== (condition.value === 1)) continue;
        const a = i * dim + j;
        const b = a | m;
        const c = (i | m) * dim + j;
        const d = c | m;
        const traceRe = re[a] + re[d];
        const traceIm = im[a] + im[d];
        re[a] = keep * re[a] + share * traceRe;
        im[a] = keep * im[a] + share * traceIm;
        re[d] = keep * re[d] + share * traceRe;
        im[d] = keep * im[d] + share * traceIm;
        re[b] *= keep;
        im[b] *= keep;
        re[c] *= keep;
        im[c] *= keep;
      }
    }
    return;
  }
  for (let i = 0; i < dim; i++) {
    if (i & touched) continue;
    for (let j = 0; j < dim; j++) {
      if (j & touched) continue;
      if (condition && ((j & read) !== 0) !== (condition.value === 1)) continue;
      let traceRe = 0;
      let traceIm = 0;
      for (let k = 0; k < offsets.length; k++) {
        const at = (i | offsets[k]) * dim + (j | offsets[k]);
        traceRe += re[at];
        traceIm += im[at];
      }
      for (let ka = 0; ka < offsets.length; ka++) {
        const row = (i | offsets[ka]) * dim;
        for (let kb = 0; kb < offsets.length; kb++) {
          const at = row + (j | offsets[kb]);
          re[at] = keep * re[at] + (ka === kb ? share * traceRe : 0);
          im[at] = keep * im[at] + (ka === kb ? share * traceIm : 0);
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
 * Runs the circuit on ρ, calling `afterColumn` after each column. Returns the final working ρ and the qubits
 * whose last operation is a measurement a condition reads, still split into right and wrong readings (see `misread`).
 */
function evolve(circuit: Circuit, afterColumn: (rho: DensityMatrix, split: Set<number>, column: number) => void = () => {}) {
  if (circuit.qubits > DENSITY_QUBITS) throw new Error(`The density-matrix simulator works with up to ${DENSITY_QUBITS} qubits`);
  const n = circuit.qubits;
  const partway = partwayMeasurements(circuit);
  const readout = circuit.noise?.readout ?? 0;
  const rho: DensityMatrix = { qubits: n, re: new Float64Array(1 << (2 * n)), im: new Float64Array(1 << (2 * n)), mixed: true };
  rho.re[0] = 1;
  const split = new Set<number>();
  circuit.columns.forEach((column, c) => {
    for (const op of column) {
      for (const q of operationQubits(op)) if (split.delete(q)) merge(rho, q);
      if (op.gate !== 'M') {
        applyGate(rho, op, circuit.noise);
        continue;
      }
      for (const q of op.targets) {
        if (!partway.has(`${c}:${q}`)) continue;
        dephase(rho, q);
        if (readout > 0) {
          misread(rho, q, readout);
          split.add(q);
        }
      }
    }
    afterColumn(rho, split, c);
  });
  return { rho, split };
}

/**
 * Writes the density matrix before any column, then after each one, into `re` and `im` (step k at k·4ⁿ),
 * so a long circuit keeps a single copy of each snapshot. Snapshots show the state with misread parts merged.
 */
export function simulateDensity(circuit: Circuit, re: Float64Array, im: Float64Array): void {
  const size = 1 << (2 * circuit.qubits);
  const save = (rho: DensityMatrix, split: Set<number>, step: number) => {
    const snapshot: DensityMatrix = { qubits: rho.qubits, re: re.subarray(step * size, (step + 1) * size), im: im.subarray(step * size, (step + 1) * size), mixed: true };
    snapshot.re.set(rho.re);
    snapshot.im.set(rho.im);
    split.forEach((q) => merge(snapshot, q));
  };
  re[0] = 1;
  evolve(circuit, (rho, split, c) => save(rho, split, c + 1));
}

/**
 * What a run reports when every qubit is read at the end: a qubit whose last operation is a measurement a
 * condition reads reports that measurement's recorded bit, and every other qubit a fresh, possibly misread, reading.
 */
export function reportedDensityProbabilities(circuit: Circuit): Float64Array {
  const { rho, split } = evolve(circuit);
  const n = circuit.qubits;
  const dim = 1 << n;
  const recorded = [...split].reduce((acc, q) => acc | mask(q, n), 0);
  const p = new Float64Array(dim);
  for (let i = 0; i < dim; i++) {
    for (let k = 0; k < dim; k++) {
      if ((i ^ k) & ~recorded) continue;
      p[k] += rho.re[i * dim + k];
    }
  }
  return withReadout(p, n, circuit.noise?.readout ?? 0, split);
}
