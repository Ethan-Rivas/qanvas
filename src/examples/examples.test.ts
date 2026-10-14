import { describe, expect, it } from 'vitest';
import type { Circuit } from '../circuit/model';
import { blochLength, blochVector } from '../sim/analysis';
import { finalState, reportedProbabilities } from '../sim/simulator';
import { EXAMPLES } from './examples';

const start = { x: Math.sin(1.1), y: 0, z: Math.cos(1.1) };
const close = (a: { x: number; y: number; z: number }, b: typeof a) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-9;
const withoutColumn = (circuit: Circuit, find: (c: Circuit['columns'][number]) => boolean): Circuit => ({ ...circuit, columns: circuit.columns.filter((c) => !find(c)) });

describe('examples do what their descriptions and challenges say', () => {
  it('teleportation moves q0’s starting state onto q2, and fails without the conditional X', () => {
    const { teleportation } = EXAMPLES;
    expect(close(blochVector(finalState(teleportation), 2), start)).toBe(true);
    const noX = withoutColumn(teleportation, (c) => c.some((op) => op.gate === 'X' && op.condition?.qubit === 1));
    expect(blochLength(blochVector(finalState(noX), 2))).toBeLessThan(0.99);
  });

  it('the bit-flip code restores q0 whether the error hits q1 or q0', () => {
    const code = EXAMPLES['bit-flip-code'];
    expect(close(blochVector(finalState(code), 0), start)).toBe(true);
    const errorColumn = code.columns.findIndex((c) => c.length === 1 && c[0].gate === 'X' && !c[0].controls);
    const onQ0: Circuit = { ...code, columns: code.columns.map((c, i) => (i === errorColumn ? [{ gate: 'X', targets: [0] }] : c)) };
    expect(close(blochVector(finalState(onQ0), 0), start)).toBe(true);
    expect(blochVector(finalState(onQ0), 1).z).toBeCloseTo(-1, 9);
    expect(blochVector(finalState(onQ0), 2).z).toBeCloseTo(-1, 9);
  });

  it('the noisy Bell state disagrees sometimes, even without readout errors', () => {
    const bell = EXAMPLES['noisy-bell'];
    const disagree = (c: Circuit) => {
      const p = reportedProbabilities(c);
      return p[0b01] + p[0b10];
    };
    expect(disagree(bell)).toBeGreaterThan(0.01);
    expect(disagree({ ...bell, noise: { ...bell.noise!, readout: 0 } })).toBeGreaterThan(0.01);
  });
});
