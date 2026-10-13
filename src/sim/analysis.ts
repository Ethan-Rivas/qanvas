import { formatAngle } from '../circuit/angle';
import { isMixed, type QuantumState, type StateVector } from './simulator';

const EPSILON = 1e-9;

export interface Bloch {
  x: number;
  y: number;
  z: number;
}

/**
 * The qubit's Bloch vector, from its reduced density matrix (a partial trace over the others).
 * With ρ = (I + xX + yY + zZ)/2: z = ρ00 − ρ11 and ρ01 = (x − iy)/2. In a pure state a length
 * below 1 means entanglement; in a mixed one it can also mean a measured, unknown value.
 */
export function blochVector(state: QuantumState, qubit: number): Bloch {
  const { re, im, qubits } = state;
  const dim = 1 << qubits;
  const m = 1 << (qubits - 1 - qubit);
  let p0 = 0;
  let p1 = 0;
  let cr = 0;
  let ci = 0;
  for (let i = 0; i < dim; i++) {
    if (i & m) continue;
    const j = i | m;
    if (isMixed(state)) {
      p0 += re[i * dim + i];
      p1 += re[j * dim + j];
      cr += re[i * dim + j];
      ci += im[i * dim + j];
    } else {
      p0 += re[i] ** 2 + im[i] ** 2;
      p1 += re[j] ** 2 + im[j] ** 2;
      // ρ01 += a_i · conj(a_j)
      cr += re[i] * re[j] + im[i] * im[j];
      ci += im[i] * re[j] - re[i] * im[j];
    }
  }
  return { x: 2 * cr, y: -2 * ci, z: p0 - p1 };
}

export function blochLength({ x, y, z }: Bloch): number {
  return Math.hypot(x, y, z);
}

export function isEntangled(bloch: Bloch): boolean {
  return blochLength(bloch) < 1 - 1e-6;
}

/** True when both states are equal entry by entry. */
export function sameState(a: QuantumState, b: QuantumState): boolean {
  return a.re.length === b.re.length && a.re.every((r, i) => Math.abs(r - b.re[i]) < EPSILON && Math.abs(a.im[i] - b.im[i]) < EPSILON);
}

/** True when `b` is `a` times a single phase e^{iφ}, which no measurement can detect. A density matrix has no global phase. */
export function sameUpToPhase(a: QuantumState, b: QuantumState): boolean {
  if (isMixed(a) || isMixed(b)) return sameState(a, b);
  let overlapRe = 0;
  let overlapIm = 0;
  for (let i = 0; i < a.re.length; i++) {
    overlapRe += a.re[i] * b.re[i] + a.im[i] * b.im[i];
    overlapIm += a.re[i] * b.im[i] - a.im[i] * b.re[i];
  }
  return Math.hypot(overlapRe, overlapIm) > 1 - EPSILON;
}

/**
 * The state as a vector when it is pure (up to a global phase), or null when it's a mix of outcomes.
 * For pure ρ = ψψ†, column j divided by √ρjj is ψ times the phase of conj(ψj).
 */
export function pureVector(state: QuantumState): StateVector | null {
  if (!isMixed(state)) return state;
  const { qubits, re, im } = state;
  const dim = 1 << qubits;
  let purity = 0;
  for (let k = 0; k < re.length; k++) purity += re[k] ** 2 + im[k] ** 2;
  if (purity < 1 - EPSILON) return null;
  let j = 0;
  for (let i = 1; i < dim; i++) if (re[i * dim + i] > re[j * dim + j]) j = i;
  const scale = 1 / Math.sqrt(re[j * dim + j]);
  const vector = { qubits, re: new Float64Array(dim), im: new Float64Array(dim) };
  for (let i = 0; i < dim; i++) {
    vector.re[i] = re[i * dim + j] * scale;
    vector.im[i] = im[i * dim + j] * scale;
  }
  return vector;
}

/** The state as a row-major density matrix; a pure state ψ becomes ψψ†. */
export function densityOf(state: QuantumState): { re: Float64Array; im: Float64Array } {
  if (isMixed(state)) return state;
  const dim = state.re.length;
  const re = new Float64Array(dim * dim);
  const im = new Float64Array(dim * dim);
  for (let i = 0; i < dim; i++) {
    for (let j = 0; j < dim; j++) {
      re[i * dim + j] = state.re[i] * state.re[j] + state.im[i] * state.im[j];
      im[i * dim + j] = state.im[i] * state.re[j] - state.re[i] * state.im[j];
    }
  }
  return { re, im };
}

function trim(value: number): string {
  return value.toFixed(3).replace(/\.?0+$/, '');
}

/** "0.5", "−0.5i", "0.354+0.354i" */
export function formatComplex(re: number, im: number): string {
  const r = Math.abs(re) < 5e-4 ? 0 : re;
  const i = Math.abs(im) < 5e-4 ? 0 : im;
  const minus = (s: string) => s.replace('-', '−');
  if (i === 0) return minus(trim(r));
  const size = trim(Math.abs(i));
  const imaginary = `${size === '1' ? '' : size}i`;
  if (r === 0) return `${i < 0 ? '−' : ''}${imaginary}`;
  return `${minus(trim(r))}${i < 0 ? '−' : '+'}${imaginary}`;
}

const MAX_TERMS = 4;

function ket(index: number, qubits: number): string {
  return `|${index.toString(2).padStart(qubits, '0')}⟩`;
}

/** A phase as a prefix: "", "−", "i", "−i" or "e^(iπ/4)". */
function phasePrefix(re: number, im: number): string {
  const angle = Math.atan2(im, re);
  if (Math.abs(angle) < EPSILON) return '';
  if (Math.abs(Math.abs(angle) - Math.PI) < EPSILON) return '−';
  if (Math.abs(angle - Math.PI / 2) < EPSILON) return 'i';
  if (Math.abs(angle + Math.PI / 2) < EPSILON) return '−i';
  return `e^(i${formatAngle(angle).replace('-', '−')})`;
}

function joinTerms(terms: string[], total: number): string {
  const shown = total > MAX_TERMS ? [...terms.slice(0, 2), '…', terms[terms.length - 1]] : terms;
  return shown.reduce((sum, term, k) => {
    if (k === 0) return term;
    if (term.startsWith('−')) return `${sum} − ${term.slice(1)}`;
    return `${sum} + ${term}`;
  }, '');
}

/**
 * The state as a short sum of kets, like "(|000⟩ + |110⟩)/√2". Equal-size amplitudes are
 * factored out; long sums keep only their first and last terms.
 */
export function formatState(state: StateVector): string {
  const { re, im, qubits } = state;
  const nonzero: number[] = [];
  for (let i = 0; i < re.length; i++) if (Math.hypot(re[i], im[i]) > EPSILON) nonzero.push(i);

  const size = Math.hypot(re[nonzero[0]], im[nonzero[0]]);
  const equal = nonzero.every((i) => Math.abs(Math.hypot(re[i], im[i]) - size) < EPSILON);
  const k = nonzero.length;
  const pick = k > MAX_TERMS ? [...nonzero.slice(0, 2), nonzero[k - 1]] : nonzero;

  if (equal) {
    const terms = pick.map((i) => `${phasePrefix(re[i], im[i])}${ket(i, qubits)}`);
    if (k === 1) return terms[0];
    const root = Math.sqrt(k);
    const divisor = Number.isInteger(root) ? `${root}` : `√${k}`;
    return `(${joinTerms(terms, k)})/${divisor}`;
  }
  const terms = pick.map((i) => {
    const amplitude = formatComplex(re[i], im[i]);
    return amplitude.slice(1).match(/[+−]/) ? `(${amplitude})${ket(i, qubits)}` : `${amplitude}${ket(i, qubits)}`;
  });
  return joinTerms(terms, k);
}
