import { describe, expect, it } from 'vitest';
import type { Circuit } from '../circuit/model';
import { sameUpToPhase } from '../sim/analysis';
import { finalState } from '../sim/simulator';
import { importQuirk } from './quirkImport';

const quirkLink = (json: object) => `https://algassert.com/quirk#circuit=${encodeURIComponent(JSON.stringify(json))}`;

function imported(input: string): Circuit {
  const result = importQuirk(input);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.circuit;
}

describe('Quirk import', () => {
  it('reads a Quirk link with the top wire as q0 and skips display cells', () => {
    const circuit = imported(quirkLink({ cols: [['H', 'X'], ['•', 'X'], ['Bloch', 'Chance2'], ['Measure', 'Measure']] }));
    expect(circuit).toEqual({
      qubits: 2,
      columns: [
        [{ gate: 'H', targets: [0] }, { gate: 'X', targets: [1] }],
        [{ gate: 'X', targets: [1], controls: [0] }],
        [{ gate: 'M', targets: [0, 1] }],
      ],
    });
  });

  it('gives the same state as the circuit built by hand, including turns, formulas and Quirk-E links', () => {
    const link = 'https://quirk-e.dev/#circuit={"cols":[["H","X^½","Y^-¼"],["•","X","X"],["Z^½","Z^-⅛","Rzft"],[1,"Swap","Swap"]]}'.replace('"Rzft"', '{"id":"Rzft","arg":"pi/3"}');
    const byHand: Circuit = {
      qubits: 3,
      columns: [
        [{ gate: 'H', targets: [0] }, { gate: 'RX', targets: [1], angle: Math.PI / 2 }, { gate: 'RY', targets: [2], angle: -Math.PI / 4 }],
        [{ gate: 'X', targets: [1], controls: [0] }],
        [{ gate: 'X', targets: [2], controls: [0] }],
        [{ gate: 'S', targets: [0] }, { gate: 'P', targets: [1], angle: -Math.PI / 8 }, { gate: 'RZ', targets: [2], angle: Math.PI / 3 }],
        [{ gate: 'SWAP', targets: [1, 2] }],
      ],
    };
    expect(sameUpToPhase(finalState(imported(link)), finalState(byHand))).toBe(true);
  });

  it('refuses links it cannot import exactly and names what is missing', () => {
    const grover = { cols: [['H', 'H'], ['~oracle'], ['◦', 'X'], ['•', 'H'], [{ id: 'Rxft', arg: 'pi t' }]], gates: [{ id: '~oracle', name: 'Oracle', circuit: { cols: [] } }] };
    expect(importQuirk(quirkLink(grover))).toEqual({ ok: false, error: { code: 'unsupported', detail: 'Oracle, ◦, •H, Rxft(pi t)' } });
    expect(importQuirk(quirkLink({ cols: [['Measure'], ['H']] }))).toEqual({ ok: false, error: { code: 'after-measure' } });
    expect(importQuirk('https://algassert.com/quirk#circuit={"cols":')).toEqual({ ok: false, error: { code: 'invalid' } });
  });
});
