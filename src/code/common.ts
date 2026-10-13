import type { Circuit, Operation } from '../circuit/model';
import type { Translate } from '../i18n/i18n';

export type CodeFormat = 'qiskit' | 'cirq' | 'pyquil' | 'qasm';

/** One line of generated code; `column` is the circuit column it comes from, if any. */
export interface CodeLine {
  text: string;
  column?: number;
}

export type Generator = (circuit: Circuit, t: Translate) => CodeLine[];

const PI_DENOMINATORS = [1, 2, 3, 4, 6, 8, 12];
// Much tighter than the simulator tolerance, so a fraction of pi is only written when it is exact.
const EXACT = 1e-12;

/** `[n, d]` when the angle is n·π/d with a small denominator. */
export function piFraction(angle: number): [number, number] | null {
  for (const d of PI_DENOMINATORS) {
    const n = Math.round((angle / Math.PI) * d);
    if (n !== 0 && Math.abs(angle - (n * Math.PI) / d) < EXACT) return [n, d];
  }
  return null;
}

/** A float literal that Python and OpenQASM 2 both read back to the same number. */
export function numberLiteral(value: number): string {
  const text = String(value);
  return /^-?\d+e/.test(text) ? text.replace('e', '.0e') : text;
}

/** The angle as code: `pi/2`, `-3*pi/4`, or a plain number. */
export function angleExpression(angle: number): string {
  if (angle === 0) return '0';
  const fraction = piFraction(angle);
  if (!fraction) return numberLiteral(angle);
  const [n, d] = fraction;
  const sign = n < 0 ? '-' : '';
  const numerator = Math.abs(n) === 1 ? 'pi' : `${Math.abs(n)}*pi`;
  return d === 1 ? `${sign}${numerator}` : `${sign}${numerator}/${d}`;
}

export function usesPi(lines: CodeLine[]): boolean {
  return lines.some((line) => /\bpi\b/.test(line.text));
}

export function measures(circuit: Circuit): boolean {
  return operations(circuit).some(({ op }) => op.gate === 'M');
}

export function operations(circuit: Circuit): { op: Operation; column: number }[] {
  return circuit.columns.flatMap((ops, column) => ops.map((op) => ({ op, column })));
}

export function hasConditions(circuit: Circuit): boolean {
  return operations(circuit).some(({ op }) => op.condition !== undefined);
}

/** Cirq's key for a qubit's nth measurement: each key can be used once, so q1, then q1_2, q1_3… */
export function measurementKey(qubit: number, nth: number): string {
  return nth === 1 ? `q${qubit}` : `q${qubit}_${nth}`;
}

/** How many times each qubit is measured. */
export function measurementCounts(circuit: Circuit): number[] {
  const counts = new Array<number>(circuit.qubits).fill(0);
  for (const { op } of operations(circuit)) if (op.gate === 'M') op.targets.forEach((q) => counts[q]++);
  return counts;
}
