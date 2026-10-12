import { describe, expect, it } from 'vitest';
import { codeText, generateCode } from '../code/generate';
import { EXAMPLES } from '../examples/examples';
import { translator } from '../i18n/i18n';
import { readQasmEdit } from './qasmEdit';

const t = translator('en');

describe('OpenQASM editing', () => {
  it('ignores edits that leave the circuit as it is', () => {
    for (const circuit of Object.values(EXAMPLES)) {
      const text = codeText(generateCode('qasm', circuit, t));
      expect(readQasmEdit(`${text}\n// a note\n`, circuit, t)).toEqual({ ok: true, circuit: null });
    }
  });

  it('returns the new circuit for a real change, and the error for invalid code', () => {
    const bell = EXAMPLES.bell;
    const text = codeText(generateCode('qasm', bell, t));
    const edited = readQasmEdit(text.replace('h q[0];', 'x q[0];'), bell, t);
    expect(edited.ok && edited.circuit?.columns[0]).toEqual([{ gate: 'X', targets: [0] }]);
    expect(readQasmEdit(text.replace('h q[0];', 'h q[0]'), bell, t).ok).toBe(false);
  });
});
