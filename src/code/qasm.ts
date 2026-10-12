import { kindOf } from '../circuit/gates';
import type { Operation } from '../circuit/model';
import { angleExpression, measures, operations, type CodeLine, type Generator } from './common';

// P(θ) is written as u1(θ), the same matrix, because qelib1.inc has no p gate.
const NAME: Record<string, string> = {
  H: 'h', X: 'x', Y: 'y', Z: 'z', S: 's', Sdg: 'sdg', T: 't', Tdg: 'tdg',
  RX: 'rx', RY: 'ry', RZ: 'rz', P: 'u1',
  CNOT: 'cx', CZ: 'cz', SWAP: 'swap', CCX: 'ccx',
};

function statement(op: Operation): string {
  const kind = kindOf(op);
  if (kind === 'M') return op.targets.map((q) => `measure q[${q}] -> c[${q}];`).join(' ');
  const args = [...(op.controls ?? []), ...op.targets].map((q) => `q[${q}]`).join(',');
  const angle = op.angle === undefined ? '' : `(${angleExpression(op.angle)})`;
  return `${NAME[kind]}${angle} ${args};`;
}

export const toQasm: Generator = (circuit) => {
  const lines: CodeLine[] = [{ text: 'OPENQASM 2.0;' }, { text: 'include "qelib1.inc";' }];
  // The standard qelib1.inc has no swap, so it is defined here when used.
  if (operations(circuit).some(({ op }) => op.gate === 'SWAP')) lines.push({ text: 'gate swap a,b { cx a,b; cx b,a; cx a,b; }' });
  lines.push({ text: '' }, { text: `qreg q[${circuit.qubits}];` });
  if (measures(circuit)) lines.push({ text: `creg c[${circuit.qubits}];` });
  for (const { op, column } of operations(circuit)) lines.push({ text: statement(op), column });
  return lines;
};
