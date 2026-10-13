import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sameCircuit, type Circuit } from '../circuit/model';
import { translator } from '../i18n/i18n';
import { densityOf } from '../sim/analysis';
import { finalState } from '../sim/simulator';
import { codeText, generateCode } from './generate';
import { importQasm } from './qasmImport';

const t = translator('en');

describe('OpenQASM import', () => {
  it('reads back every exported reference circuit with the same final state', () => {
    const cases: { name: string; circuit: Circuit }[] = ['single-gate', 'examples', 'random'].flatMap((file) =>
      JSON.parse(readFileSync(join(__dirname, '../../reference/data', `${file}.json`), 'utf8')),
    );
    const failures = cases.filter(({ circuit }) => {
      const result = importQasm(codeText(generateCode('qasm', circuit, t)));
      if (!result.ok) return true;
      const a = finalState(circuit);
      const b = finalState(result.circuit);
      return a.re.some((re, i) => Math.hypot(re - b.re[i], a.im[i] - b.im[i]) > 1e-9);
    });
    expect(failures.map((c) => c.name)).toEqual([]);
  });

  it('reads back circuits that measure partway through with the same density matrix', () => {
    const cases = JSON.parse(readFileSync(join(__dirname, '../../reference/data/mid-circuit.json'), 'utf8')) as { name: string; circuit: Circuit }[];
    const failures = cases.filter(({ circuit }) => {
      const result = importQasm(codeText(generateCode('qasm', circuit, t)));
      if (!result.ok) return true;
      const a = densityOf(finalState(circuit));
      const b = densityOf(finalState(result.circuit));
      return a.re.some((re, i) => Math.hypot(re - b.re[i], a.im[i] - b.im[i]) > 1e-9);
    });
    expect(failures.map((c) => c.name)).toEqual([]);
  });

  it('says a gate cannot be conditioned on its own measured qubit', () => {
    expect(importQasm('OPENQASM 2.0;\nqreg q[1];\ncreg c0[1];\nmeasure q[0] -> c0[0];\nif(c0==1) x q[0];')).toMatchObject({
      ok: false,
      error: { code: 'classical-control', line: 5 },
    });
  });

  it('reads code written elsewhere: comments, registers, broadcasts and expressions', () => {
    const result = importQasm(`OPENQASM 2.0;
      include "qelib1.inc"; // standard gates
      qreg a[1];
      qreg b[2];
      creg c[2];
      h b;
      CX a[0], b[1];
      barrier a, b;
      p(-(pi/2) + 2*pi) a[0];
      measure b -> c;`);
    expect(result).toEqual({
      ok: true,
      circuit: {
        qubits: 3,
        columns: [
          [{ gate: 'H', targets: [1] }, { gate: 'H', targets: [2] }],
          [{ gate: 'X', controls: [0], targets: [2] }, { gate: 'M', targets: [1] }],
          [{ gate: 'P', targets: [0], angle: 1.5 * Math.PI }, { gate: 'M', targets: [2] }],
        ],
      },
    });
  });

  it('explains what it cannot read, with the line', () => {
    expect(importQasm('OPENQASM 2.0;\nqreg q[1];\nu3(0,0,0) q[0];')).toEqual({ ok: false, error: { code: 'unsupported-gate', line: 3, detail: 'u3' } });
    expect(importQasm('OPENQASM 3.0;\nqubit[2] q;')).toMatchObject({ ok: false, error: { code: 'version', line: 1 } });
  });

  it('reads reset, gates after a measurement and Qiskit-style conditions', () => {
    const source = 'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\ncreg c0[1];\ncreg c1[1];\nh q[0];\nmeasure q[0] -> c0[0];\nif (c0 == 1) x q[1];\nreset q[0];\nh q[0];';
    expect(importQasm(source)).toEqual({
      ok: true,
      circuit: {
        qubits: 2,
        columns: [
          [{ gate: 'H', targets: [0] }],
          [{ gate: 'M', targets: [0] }],
          [{ gate: 'X', targets: [1], condition: { qubit: 0, value: 1 } }],
          [{ gate: 'RESET', targets: [0] }],
          [{ gate: 'H', targets: [0] }],
        ],
      },
    });
  });

  it('reads back its own export of a dynamic circuit', () => {
    const circuit: Circuit = {
      qubits: 2,
      columns: [[{ gate: 'H', targets: [0] }], [{ gate: 'M', targets: [0] }], [{ gate: 'Z', targets: [1], condition: { qubit: 0, value: 0 } }], [{ gate: 'RESET', targets: [0] }]],
    };
    const result = importQasm(codeText(generateCode('qasm', circuit, translator('en'))));
    expect(result.ok && sameCircuit(result.circuit, circuit)).toBe(true);
  });

  it('refuses conditions it cannot draw', () => {
    const header = 'OPENQASM 2.0;\nqreg q[2];\ncreg c[2];\n';
    expect(importQasm(`${header}measure q[0] -> c[0];\nif(c==1) x q[1];`)).toMatchObject({ ok: false, error: { code: 'classical-control', line: 5 } });
    expect(importQasm('OPENQASM 2.0;\nqreg q[2];\ncreg d[1];\nmeasure q[0] -> d[0];\nx q[0];\nif(d==1) x q[1];')).toMatchObject({ ok: false, error: { code: 'classical-control', line: 6 } });
  });
});
