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

const dynamic: Circuit = {
  qubits: 2,
  columns: [
    [{ gate: 'H', targets: [0] }],
    [{ gate: 'M', targets: [0] }],
    [{ gate: 'X', targets: [1], condition: { qubit: 0, value: 1 } }],
    [{ gate: 'Sdg', targets: [1], condition: { qubit: 0, value: 0 } }],
    [{ gate: 'RESET', targets: [0] }],
    [{ gate: 'M', targets: [0, 1] }],
  ],
};

describe('dynamic circuits', () => {
  it('writes one classical register per qubit and if_test in Qiskit', () => {
    const text = codeText(generateCode('qiskit', dynamic, t));
    expect(text).toContain('from qiskit import ClassicalRegister, QuantumCircuit, QuantumRegister\n');
    expect(text).toContain('c = [ClassicalRegister(1, f"c{q}") for q in range(2)]\nqc = QuantumCircuit(QuantumRegister(2, "q"), *c)\n');
    expect(text).toContain('with qc.if_test((c[0], 1)):\n    qc.x(1)\nwith qc.if_test((c[0], 0)):\n    qc.sdg(1)\nqc.reset(0)\n');
  });

  it('writes reset and if in OpenQASM, and distinct measurement keys in Cirq', () => {
    expect(codeText(generateCode('qasm', dynamic, t))).toContain('creg c0[1];\ncreg c1[1];\nh q[0];\nmeasure q[0] -> c0[0];\nif(c0==1) x q[1];\nif(c0==0) sdg q[1];\nreset q[0];\nmeasure q[0] -> c0[0]; measure q[1] -> c1[0];\n');
    const cirq = codeText(generateCode('cirq', dynamic, t));
    expect(cirq).toContain('cirq.Moment(cirq.X(q[1]).with_classical_controls("q0")),');
    expect(cirq).toContain('cirq.Moment(cirq.reset(q[0])),');
    expect(cirq).toContain('(cirq.S**-1)(q[1]).with_classical_controls(sympy.Eq(sympy.Symbol("q0"), 0))');
    expect(cirq).toContain('cirq.measure(q[0], key="q0_2"), cirq.measure(q[1], key="q1")');
  });

  it('writes reset as measure-and-flip and conditions as if_then in pyQuil', () => {
    const text = codeText(generateCode('pyquil', dynamic, t));
    expect(text).toContain('reset = program.declare("reset", "BIT", 2)\n');
    expect(text).toContain('program.if_then(ro[0], Program(X(1)), Program())\n');
    expect(text).toContain('program += MEASURE(0, reset[0])');
    expect(text).toContain('program.if_then(reset[0], Program(X(0)), Program())\n');
    expect(text).toContain('program.if_then(ro[0], Program(), Program(PHASE(-pi/2, 1)))  # S†\n');
  });
});
