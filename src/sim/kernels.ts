import type { GateName } from '../circuit/model';

/** The vector shape the kernels act on; a density matrix is passed as a 2n-qubit one. */
export interface Amplitudes {
  qubits: number;
  re: Float64Array;
  im: Float64Array;
}

/** Row-major 2×2 complex matrix: [a, b, c, d] as separate real and imaginary parts. */
export interface Matrix2 {
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

export function gateMatrix(gate: GateName, angle = 0): Matrix2 {
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

export function mask(qubit: number, qubits: number): number {
  return 1 << (qubits - 1 - qubit);
}

export function conjugate(m: Matrix2): Matrix2 {
  return { re: m.re, im: m.im.map((v) => -v) as Matrix2['im'] };
}

export function applySingle(state: Amplitudes, m: Matrix2, target: number, controls: number[]) {
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

export function applySwap(state: Amplitudes, a: number, b: number) {
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
