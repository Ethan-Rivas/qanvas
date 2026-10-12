import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../examples/examples';
import { decodeLink, encodeLink, fromFile, toFile } from './share';

describe('sharing', () => {
  it('round-trips a circuit through a short link', async () => {
    const link = await encodeLink({ circuit: EXAMPLES.teleportation, exampleId: 'teleportation' });
    expect(link).toMatch(/^#c=[\w-]+$/);
    expect(link.length).toBeLessThan(250);
    expect(await decodeLink(link)).toEqual({ circuit: EXAMPLES.teleportation, exampleId: 'teleportation' });
  });

  it('round-trips a circuit through a file', () => {
    expect(fromFile(toFile({ circuit: EXAMPLES.ghz, exampleId: null }))).toEqual({ circuit: EXAMPLES.ghz, exampleId: null });
  });

  it('rejects broken or invalid data', async () => {
    expect(await decodeLink('#c=not-a-circuit')).toBeNull();
    expect(fromFile('{"format":"qanvas","version":1,"circuit":{"qubits":2,"columns":[[{"gate":"H","targets":[5]}]]}}')).toBeNull();
    expect(fromFile('{"qubits":2,"columns":[]}')).toBeNull();
  });
});
