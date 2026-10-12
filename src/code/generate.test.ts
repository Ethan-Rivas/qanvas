import { describe, expect, it } from 'vitest';
import type { Circuit } from '../circuit/model';
import { translator } from '../i18n/i18n';
import { angleExpression } from './common';
import { codeText, generateCode } from './generate';

const t = translator('en');

const ghz: Circuit = {
  qubits: 3,
  columns: [
    [{ gate: 'H', targets: [0] }],
    [{ gate: 'X', controls: [0], targets: [1] }],
    [{ gate: 'X', controls: [1], targets: [2] }],
    [{ gate: 'M', targets: [0, 1, 2] }],
  ],
};

describe('code generators', () => {
  it('writes readable Qiskit code with each line tied to its step', () => {
    const lines = generateCode('qiskit', ghz, t);
    expect(codeText(lines)).toBe(
      [
        'from qiskit import QuantumCircuit',
        '',
        '# Qiskit prints results with q0 as the rightmost bit; Qanvas shows q0 first.',
        'qc = QuantumCircuit(3, 3)',
        'qc.h(0)',
        'qc.cx(0, 1)',
        'qc.cx(1, 2)',
        'qc.measure([0, 1, 2], [0, 1, 2])',
        '',
      ].join('\n'),
    );
    expect(lines.filter((line) => line.column !== undefined).map((line) => line.column)).toEqual([0, 1, 2, 3]);
  });

  it('defines swap and writes P as u1 in OpenQASM', () => {
    const circuit: Circuit = { qubits: 2, columns: [[{ gate: 'P', targets: [0], angle: -3 * Math.PI / 4 }], [{ gate: 'SWAP', targets: [0, 1] }]] };
    expect(codeText(generateCode('qasm', circuit, t))).toContain('gate swap a,b { cx a,b; cx b,a; cx a,b; }\n\nqreg q[2];\nu1(-3*pi/4) q[0];\nswap q[0],q[1];\n');
  });

  it('writes exact fractions of pi and other angles in full', () => {
    expect(angleExpression(Math.PI / 2)).toBe('pi/2');
    expect(angleExpression(1.57)).toBe('1.57');
    expect(angleExpression(1e-7)).toBe('1.0e-7');
  });
});
