import { kindOf } from '../circuit/gates';
import { gateError, hasNoise, operationQubits, type Circuit, type Condition, type Operation } from '../circuit/model';
import type { Translate } from '../i18n/i18n';
import { noisyGateSizes, numberLiteral, angleExpression, measurementKey, piFraction, usesPi, type CodeLine, type Generator } from './common';

const SIMPLE: Record<string, string> = { H: 'cirq.H', X: 'cirq.X', Y: 'cirq.Y', Z: 'cirq.Z', S: 'cirq.S', T: 'cirq.T', Sdg: '(cirq.S**-1)', Tdg: '(cirq.T**-1)' };
const ROTATION: Record<string, string> = { RX: 'cirq.rx', RY: 'cirq.ry', RZ: 'cirq.rz' };

/** P(θ) is Z raised to θ/π; written as an exact fraction when θ is a fraction of π. */
function phaseExponent(angle: number): string {
  const fraction = piFraction(angle);
  if (!fraction) return `${numberLiteral(angle)} / pi`;
  const [n, d] = fraction;
  return d === 1 ? `${n}` : `${n}/${d}`;
}

function plainGate(op: Operation, count: number[], readout: number): string {
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
      return op.targets.map((t) => cirqMeasure(t, measurementKey(t, ++count[t]), readout)).join(', ');
    case 'RESET':
      return `cirq.reset(${q(target)})`;
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

/** A measurement whose reading comes out wrong with probability `readout` (Cirq's confusion map). */
export function cirqMeasure(qubit: number, key: string, readout: number): string {
  return `cirq.measure(q[${qubit}], key="${key}"${readout > 0 ? ', confusion_map=confusion' : ''})`;
}

const NOISE_CHANNEL = ['', 'one_qubit_noise', 'two_qubit_noise', 'three_qubit_noise'];
// Qiskit's depolarizing_error(p, k) counts the identity among its 4ᵏ Paulis; Cirq's depolarize(p) doesn't.
const CIRQ_SHARE = ['', '3 / 4', '15 / 16', '63 / 64'];

function classicalControl(condition: Condition, count: number[]): string {
  const key = measurementKey(condition.qubit, count[condition.qubit]);
  return condition.value === 1 ? `.with_classical_controls("${key}")` : `.with_classical_controls(sympy.Eq(sympy.Symbol("${key}"), 0))`;
}

function gate(op: Operation, count: number[], readout: number): string {
  const text = plainGate(op, count, readout);
  return op.condition ? `${text}${classicalControl(op.condition, count)}` : text;
}

/** The depolarizing channel after `op`, conditioned like the gate so it only happens when the gate runs. */
function noiseAfter(op: Operation, count: number[]): string {
  const qubits = operationQubits(op);
  const text = `${NOISE_CHANNEL[qubits.length]}.on(${qubits.map((q) => `q[${q}]`).join(', ')})`;
  return op.condition ? `${text}${classicalControl(op.condition, count)}` : text;
}

function noiseDefinitions(circuit: Circuit, t: Translate): CodeLine[] {
  const noise = circuit.noise;
  if (!noise || !hasNoise(circuit)) return [];
  const sizes = noisyGateSizes(circuit);
  const lines: CodeLine[] = [];
  if (sizes.size > 0) lines.push({ text: `# ${t('code.cirqNoise')}` });
  for (const k of [1, 2, 3]) {
    if (!sizes.has(k)) continue;
    const p = numberLiteral(k === 1 ? noise.oneQubit : noise.twoQubit);
    lines.push({ text: `${NOISE_CHANNEL[k]} = cirq.depolarize(${CIRQ_SHARE[k]} * ${p}${k > 1 ? `, n_qubits=${k}` : ''})` });
  }
  if (noise.readout > 0) {
    lines.push(
      { text: `# ${t('code.cirqReadout')}` },
      { text: `readout = ${numberLiteral(noise.readout)}` },
      { text: 'confusion = {(0,): np.array([[1 - readout, readout], [readout, 1 - readout]])}' },
    );
  }
  return lines;
}

/** One `cirq.Moment` per column, so Cirq keeps the same steps as Qanvas. */
export const toCirq: Generator = (circuit, t) => {
  const readout = circuit.noise?.readout ?? 0;
  const body: CodeLine[] = [{ text: `q = cirq.LineQubit.range(${circuit.qubits})` }, ...noiseDefinitions(circuit, t)];
  const count = new Array<number>(circuit.qubits).fill(0);
  if (circuit.columns.length === 0) {
    body.push({ text: 'circuit = cirq.Circuit()' });
  } else {
    body.push({ text: 'circuit = cirq.Circuit(' });
    circuit.columns.forEach((ops, column) => {
      body.push({ text: `    cirq.Moment(${ops.map((op) => gate(op, count, readout)).join(', ')}),`, column });
      const noisy = ops.filter((op) => gateError(op, circuit.noise) > 0);
      if (noisy.length > 0) body.push({ text: `    cirq.Moment(${noisy.map((op) => noiseAfter(op, count)).join(', ')}),`, column });
    });
    body.push({ text: ')' });
  }
  const usesSympy = body.some((line) => line.text.includes('sympy.'));
  const imports = ['import cirq', ...(readout > 0 ? ['import numpy as np'] : []), ...(usesSympy ? ['import sympy'] : []), ...(usesPi(body) ? ['from math import pi'] : [])];
  return [...imports.map((text) => ({ text })), { text: '' }, ...body];
};
