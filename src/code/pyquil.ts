import { kindOf } from '../circuit/gates';
import type { Operation } from '../circuit/model';
import { angleExpression, measures, operations, usesPi, type CodeLine, type Generator } from './common';

const NAME: Record<string, string> = {
  H: 'H', X: 'X', Y: 'Y', Z: 'Z', S: 'S', Sdg: 'PHASE', T: 'T', Tdg: 'PHASE',
  RX: 'RX', RY: 'RY', RZ: 'RZ', P: 'PHASE',
  CNOT: 'CNOT', CZ: 'CZ', SWAP: 'SWAP', CCX: 'CCNOT', M: 'MEASURE',
};

function instruction(op: Operation): string {
  const kind = kindOf(op);
  const qubits = [...(op.controls ?? []), ...op.targets].join(', ');
  if (kind === 'M') {
    const reads = op.targets.map((q) => `MEASURE(${q}, ro[${q}])`);
    return reads.length === 1 ? reads[0] : `[${reads.join(', ')}]`;
  }
  // pyQuil's built-in simulators ignore .dagger(), so S† and T† are written as the phase gates they equal.
  if (kind === 'Sdg') return `PHASE(-pi/2, ${qubits})  # S†`;
  if (kind === 'Tdg') return `PHASE(-pi/4, ${qubits})  # T†`;
  if (op.angle !== undefined) return `${NAME[kind]}(${angleExpression(op.angle)}, ${qubits})`;
  return `${NAME[kind]}(${qubits})`;
}

export const toPyQuil: Generator = (circuit) => {
  const body: CodeLine[] = [{ text: 'program = Program()' }];
  if (measures(circuit)) body.push({ text: `ro = program.declare("ro", "BIT", ${circuit.qubits})` });
  for (const { op, column } of operations(circuit)) body.push({ text: `program += ${instruction(op)}`, column });

  const gates = [...new Set(operations(circuit).map(({ op }) => NAME[kindOf(op)]))].sort();
  const imports = [
    ...(usesPi(body) ? ['from math import pi'] : []),
    'from pyquil import Program',
    ...(gates.length > 0 ? [`from pyquil.gates import ${gates.join(', ')}`] : []),
  ];
  return [...imports.map((text) => ({ text })), { text: '' }, ...body];
};
