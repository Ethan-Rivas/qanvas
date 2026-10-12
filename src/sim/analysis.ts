import { formatAngle } from '../circuit/angle';
import type { StateVector } from './simulator';

const EPSILON = 1e-9;

export interface Bloch {
  x: number;
  y: number;
  z: number;
}

/**
 * The qubit's Bloch vector, from its reduced density matrix (a partial trace over the others).
 * With ρ = (I + xX + yY + zZ)/2: z = ρ00 − ρ11 and ρ01 = (x − iy)/2. A length below 1 means
 * the qubit is entangled with the rest, since the whole state is always pure here.
 */
export function blochVector(state: StateVector, qubit: number): Bloch {
  const { re, im, qubits } = state;
  const m = 1 << (qubits - 1 - qubit);
  let p0 = 0;
  let p1 = 0;
  let cr = 0;
  let ci = 0;
  for (let i = 0; i < re.length; i++) {
    if (i & m) continue;
    const j = i | m;
    p0 += re[i] ** 2 + im[i] ** 2;
    p1 += re[j] ** 2 + im[j] ** 2;
    // ρ01 += a_i · conj(a_j)
    cr += re[i] * re[j] + im[i] * im[j];
    ci += im[i] * re[j] - re[i] * im[j];
  }
  return { x: 2 * cr, y: -2 * ci, z: p0 - p1 };
}

export function blochLength({ x, y, z }: Bloch): number {
  return Math.hypot(x, y, z);
}

export function isEntangled(bloch: Bloch): boolean {
  return blochLength(bloch) < 1 - 1e-6;
}

/** True when both states are equal amplitude by amplitude. */
export function sameState(a: StateVector, b: StateVector): boolean {
  return a.re.every((r, i) => Math.abs(r - b.re[i]) < EPSILON && Math.abs(a.im[i] - b.im[i]) < EPSILON);
}

/** True when `b` is `a` times a single phase e^{iφ}, which no measurement can detect. */
export function sameUpToPhase(a: StateVector, b: StateVector): boolean {
  let overlapRe = 0;
  let overlapIm = 0;
  for (let i = 0; i < a.re.length; i++) {
    overlapRe += a.re[i] * b.re[i] + a.im[i] * b.im[i];
    overlapIm += a.re[i] * b.im[i] - a.im[i] * b.re[i];
  }
  return Math.hypot(overlapRe, overlapIm) > 1 - EPSILON;
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
