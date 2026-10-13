import { kindOf } from '../circuit/gates';
import type { Operation } from '../circuit/model';
import { angleExpression, hasConditions, measures, operations, usesPi, type CodeLine, type Generator } from './common';

const SIMPLE: Record<string, string> = { H: 'h', X: 'x', Y: 'y', Z: 'z', S: 's', Sdg: 'sdg', T: 't', Tdg: 'tdg', RX: 'rx', RY: 'ry', RZ: 'rz', P: 'p' };

function call(op: Operation): string {
  const [target] = op.targets;
  const controls = op.controls ?? [];
  switch (kindOf(op)) {
    case 'CNOT':
      return `qc.cx(${controls[0]}, ${target})`;
    case 'CZ':
      return `qc.cz(${controls[0]}, ${target})`;
    case 'CCX':
      return `qc.ccx(${controls[0]}, ${controls[1]}, ${target})`;
    case 'SWAP':
      return `qc.swap(${op.targets[0]}, ${op.targets[1]})`;
    case 'M':
      return op.targets.length === 1
        ? `qc.measure(${target}, ${target})`
        : `qc.measure([${op.targets.join(', ')}], [${op.targets.join(', ')}])`;
    case 'RESET':
      return `qc.reset(${target})`;
    default: {
      const name = SIMPLE[op.gate];
      return op.angle === undefined ? `qc.${name}(${target})` : `qc.${name}(${angleExpression(op.angle)}, ${target})`;
    }
  }
}

/**
 * Qanvas qubit q is Qiskit qubit q and is measured into classical bit q, so no index changes here.
 * Bit order: Qiskit prints result bitstrings with q0 last, so the generated code says so in a comment.
 */
export const toQiskit: Generator = (circuit, t) => {
  const { qubits } = circuit;
  const registers = hasConditions(circuit);
  const body: CodeLine[] = [];
  if (measures(circuit)) body.push({ text: `# ${t('code.qiskitBitOrder')}` });
  if (registers) {
    body.push(
      { text: `# ${t('code.qiskitRegisters')}` },
      { text: `c = [ClassicalRegister(1, f"c{q}") for q in range(${qubits})]` },
      { text: `qc = QuantumCircuit(QuantumRegister(${qubits}, "q"), *c)` },
    );
  } else {
    body.push({ text: measures(circuit) ? `qc = QuantumCircuit(${qubits}, ${qubits})` : `qc = QuantumCircuit(${qubits})` });
  }
  for (const { op, column } of operations(circuit)) {
    if (op.condition) {
      body.push({ text: `with qc.if_test((c[${op.condition.qubit}], ${op.condition.value})):`, column }, { text: `    ${call(op)}`, column });
    } else {
      body.push({ text: call(op), column });
    }
  }

  const qiskit = registers ? 'from qiskit import ClassicalRegister, QuantumCircuit, QuantumRegister' : 'from qiskit import QuantumCircuit';
  const imports = [...(usesPi(body) ? ['from math import pi'] : []), qiskit];
  return [...imports.map((text) => ({ text })), { text: '' }, ...body];
};
