import { kindOf } from '../circuit/gates';
import { hasNoise, type Circuit, type Operation } from '../circuit/model';
import type { Translate } from '../i18n/i18n';
import { angleExpression, hasConditions, measures, noisyGateSizes, numberLiteral, operations, usesPi, type CodeLine, type Generator } from './common';

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

const ONE_QUBIT_GATES = ['h', 'x', 'y', 'z', 's', 'sdg', 't', 'tdg', 'rx', 'ry', 'rz', 'p'];
const quoted = (names: string[]) => `[${names.map((name) => `"${name}"`).join(', ')}]`;

/** The noise as a model Qiskit Aer applies when it runs `qc`: a depolarizing error after each gate, and readout error. */
function noiseModel(circuit: Circuit, t: Translate): { imports: string[]; lines: CodeLine[] } {
  const noise = circuit.noise;
  if (!noise || !hasNoise(circuit)) return { imports: [], lines: [] };
  const sizes = noisyGateSizes(circuit);
  const lines: CodeLine[] = [{ text: '' }, { text: `# ${t('code.qiskitNoise')}` }, { text: 'noise = NoiseModel()' }];
  const error = (p: number, k: number, names: string[]) => ({ text: `noise.add_all_qubit_quantum_error(depolarizing_error(${numberLiteral(p)}, ${k}), ${quoted(names)})` });
  if (sizes.has(1)) lines.push(error(noise.oneQubit, 1, ONE_QUBIT_GATES));
  if (sizes.has(2)) lines.push(error(noise.twoQubit, 2, ['cx', 'cz', 'swap']));
  if (sizes.has(3)) lines.push(error(noise.twoQubit, 3, ['ccx']));
  if (noise.readout > 0) {
    lines.push({ text: `readout = ${numberLiteral(noise.readout)}` }, { text: 'noise.add_all_qubit_readout_error(ReadoutError([[1 - readout, readout], [readout, 1 - readout]]))' });
  }
  const names = ['NoiseModel', ...(noise.readout > 0 ? ['ReadoutError'] : []), ...(sizes.size > 0 ? ['depolarizing_error'] : [])];
  return { imports: [`from qiskit_aer.noise import ${names.join(', ')}`], lines };
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

  const noise = noiseModel(circuit, t);
  const qiskit = registers ? 'from qiskit import ClassicalRegister, QuantumCircuit, QuantumRegister' : 'from qiskit import QuantumCircuit';
  const imports = [...(usesPi(body) ? ['from math import pi'] : []), qiskit, ...noise.imports];
  return [...imports.map((text) => ({ text })), { text: '' }, ...body, ...noise.lines];
};
