import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Circuit } from '../circuit/model';
import { translator } from '../i18n/i18n';
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
    expect(importQasm('OPENQASM 2.0;\nqreg q[1];\ncreg c[1];\nmeasure q[0] -> c[0];\nh q[0];')).toMatchObject({ ok: false, error: { code: 'after-measure', line: 5 } });
    expect(importQasm('OPENQASM 3.0;\nqubit[2] q;')).toMatchObject({ ok: false, error: { code: 'version', line: 1 } });
  });
});
