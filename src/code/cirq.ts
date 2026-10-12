import { kindOf } from '../circuit/gates';
import type { Operation } from '../circuit/model';
import { numberLiteral, angleExpression, piFraction, usesPi, type CodeLine, type Generator } from './common';

const SIMPLE: Record<string, string> = { H: 'cirq.H', X: 'cirq.X', Y: 'cirq.Y', Z: 'cirq.Z', S: 'cirq.S', T: 'cirq.T', Sdg: '(cirq.S**-1)', Tdg: '(cirq.T**-1)' };
const ROTATION: Record<string, string> = { RX: 'cirq.rx', RY: 'cirq.ry', RZ: 'cirq.rz' };

/** P(θ) is Z raised to θ/π; written as an exact fraction when θ is a fraction of π. */
function phaseExponent(angle: number): string {
  const fraction = piFraction(angle);
  if (!fraction) return `${numberLiteral(angle)} / pi`;
  const [n, d] = fraction;
  return d === 1 ? `${n}` : `${n}/${d}`;
}

function gate(op: Operation): string {
  const q = (i: number) => `q[${i}]`;
  const [target] = op.targets;
  const controls = op.controls ?? [];
  switch (kindOf(op)) {
    case 'CNOT':
      return `cirq.CNOT(${q(controls[0])}, ${q(target)})`;
    case 'CZ':
      return `cirq.CZ(${q(controls[0])}, ${q(target)})`;
    case 'CCX':
      return `cirq.CCX(${q(controls[0])}, ${q(controls[1])}, ${q(target)})`;
    case 'SWAP':
      return `cirq.SWAP(${q(op.targets[0])}, ${q(op.targets[1])})`;
    case 'M':
      return op.targets.map((t) => `cirq.measure(${q(t)}, key="q${t}")`).join(', ');
    case 'P':
      return `cirq.ZPowGate(exponent=${phaseExponent(op.angle!)})(${q(target)})`;
    case 'RX':
    case 'RY':
    case 'RZ':
      return `${ROTATION[op.gate]}(${angleExpression(op.angle!)})(${q(target)})`;
    default:
      return `${SIMPLE[op.gate]}(${q(target)})`;
  }
}

/** One `cirq.Moment` per column, so Cirq keeps the same steps as Qanvas. */
export const toCirq: Generator = (circuit) => {
  const body: CodeLine[] = [{ text: `q = cirq.LineQubit.range(${circuit.qubits})` }];
  if (circuit.columns.length === 0) {
    body.push({ text: 'circuit = cirq.Circuit()' });
  } else {
    body.push({ text: 'circuit = cirq.Circuit(' });
    circuit.columns.forEach((ops, column) => body.push({ text: `    cirq.Moment(${ops.map(gate).join(', ')}),`, column }));
    body.push({ text: ')' });
  }
  const imports = ['import cirq', ...(usesPi(body) ? ['from math import pi'] : [])];
  return [...imports.map((text) => ({ text })), { text: '' }, ...body];
};
