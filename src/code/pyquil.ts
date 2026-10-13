import { kindOf } from '../circuit/gates';
import type { Operation } from '../circuit/model';
import type { Translate } from '../i18n/i18n';
import { angleExpression, measures, operations, usesPi, type CodeLine, type Generator } from './common';

const NAME: Record<string, string> = {
  H: 'H', X: 'X', Y: 'Y', Z: 'Z', S: 'S', Sdg: 'PHASE', T: 'T', Tdg: 'PHASE',
  RX: 'RX', RY: 'RY', RZ: 'RZ', P: 'PHASE',
  CNOT: 'CNOT', CZ: 'CZ', SWAP: 'SWAP', CCX: 'CCNOT', M: 'MEASURE',
};

function instruction(op: Operation): { code: string; note?: string } {
  const kind = kindOf(op);
  const qubits = [...(op.controls ?? []), ...op.targets].join(', ');
  // pyQuil's built-in simulators ignore .dagger(), so S† and T† are written as the phase gates they equal.
  if (kind === 'Sdg') return { code: `PHASE(-pi/2, ${qubits})`, note: 'S†' };
  if (kind === 'Tdg') return { code: `PHASE(-pi/4, ${qubits})`, note: 'T†' };
  if (op.angle !== undefined) return { code: `${NAME[kind]}(${angleExpression(op.angle)}, ${qubits})` };
  return { code: `${NAME[kind]}(${qubits})` };
}

function lines(op: Operation, t: Translate): string[] {
  if (op.gate === 'M') {
    const reads = op.targets.map((q) => `MEASURE(${q}, ro[${q}])`);
    return [`program += ${reads.length === 1 ? reads[0] : `[${reads.join(', ')}]`}`];
  }
  if (op.gate === 'RESET') {
    const [q] = op.targets;
    return [`program += MEASURE(${q}, reset[${q}])  # ${t('code.pyquilReset')}`, `program.if_then(reset[${q}], Program(X(${q})), Program())`];
  }
  const { code, note } = instruction(op);
  const comment = note ? `  # ${note}` : '';
  if (!op.condition) return [`program += ${code}${comment}`];
  const branches = op.condition.value === 1 ? `Program(${code}), Program()` : `Program(), Program(${code})`;
  return [`program.if_then(ro[${op.condition.qubit}], ${branches})${comment}`];
}

export const toPyQuil: Generator = (circuit, t) => {
  const resets = operations(circuit).some(({ op }) => op.gate === 'RESET');
  const body: CodeLine[] = [{ text: 'program = Program()' }];
  if (measures(circuit)) body.push({ text: `ro = program.declare("ro", "BIT", ${circuit.qubits})` });
  if (resets) body.push({ text: `reset = program.declare("reset", "BIT", ${circuit.qubits})` });
  for (const { op, column } of operations(circuit)) for (const text of lines(op, t)) body.push({ text, column });

  const names = operations(circuit).filter(({ op }) => op.gate !== 'RESET').map(({ op }) => NAME[kindOf(op)]);
  const gates = [...new Set([...names, ...(resets ? ['MEASURE', 'X'] : [])])].sort();
  const imports = [
    ...(usesPi(body) ? ['from math import pi'] : []),
    'from pyquil import Program',
    ...(gates.length > 0 ? [`from pyquil.gates import ${gates.join(', ')}`] : []),
  ];
  return [...imports.map((text) => ({ text })), { text: '' }, ...body];
};
