import { MAX_QUBITS, validateCircuit, type Circuit, type GateName, type Operation } from '../circuit/model';
import { evaluate } from './qasmImport';

export type QuirkErrorCode = 'invalid' | 'too-many-qubits' | 'unsupported' | 'after-measure';
export type QuirkResult = { ok: true; circuit: Circuit } | { ok: false; error: { code: QuirkErrorCode; detail?: string } };

const FIXED: Record<string, GateName> = { H: 'H', X: 'X', Y: 'Y', Z: 'Z', 'Z^½': 'S', 'Z^-½': 'Sdg', 'Z^¼': 'T', 'Z^-¼': 'Tdg' };

const FRACTIONS: Record<string, number> = { '½': 1 / 2, '¼': 1 / 4, '⅛': 1 / 8, '⅓': 1 / 3, '⅟₁₆': 1 / 16, '⅟₃₂': 1 / 32, '⅟₆₄': 1 / 64, '⅟₁₂₈': 1 / 128 };

// Quirk's X^f and Y^f equal Rx(πf) and Ry(πf), and Z^f equals P(πf), up to a global phase, which no
// measurement can see and which only matters for controlled versions (refused below).
const POWER: Record<string, GateName> = { X: 'RX', Y: 'RY', Z: 'P' };
const FORMULA: Record<string, { gate: GateName; scale: number }> = {
  Rxft: { gate: 'RX', scale: 1 },
  Ryft: { gate: 'RY', scale: 1 },
  Rzft: { gate: 'RZ', scale: 1 },
  'X^ft': { gate: 'RX', scale: Math.PI },
  'Y^ft': { gate: 'RY', scale: Math.PI },
  'Z^ft': { gate: 'P', scale: Math.PI },
};

/** Cells that only display the state (Quirk's probes and Quirk-E's slicer), which Qanvas shows on its own. */
const DISPLAY = /^(…|Bloch|Density\d*|Chance\d*|Amps\d+|Sample\d+|Slicer\d+)$/;

type Cell = { id: string; gate: GateName; angle?: number } | 'control' | 'swap' | 'measure' | null;

function readCell(raw: unknown, customNames: Map<string, string>, unsupported: Set<string>): Cell {
  if (raw === 1 || raw === null || raw === undefined) return null;
  const id = typeof raw === 'string' ? raw : typeof raw === 'object' && typeof (raw as { id?: unknown }).id === 'string' ? (raw as { id: string }).id : null;
  if (id === null) throw new Error('cell');
  const arg = typeof raw === 'object' ? (raw as { arg?: unknown }).arg : undefined;

  if (DISPLAY.test(id)) return null;
  if (id === '•') return 'control';
  if (id === 'Swap') return 'swap';
  if (id === 'Measure') return 'measure';
  if (id in FIXED) return { id, gate: FIXED[id] };

  const power = /^([XYZ])\^(-?)(.+)$/.exec(id);
  if (power && power[3] in FRACTIONS) return { id, gate: POWER[power[1]], angle: (power[2] ? -1 : 1) * Math.PI * FRACTIONS[power[3]] };

  if (id in FORMULA && typeof arg === 'string' && !/\bt\b/.test(arg)) {
    try {
      return { id, gate: FORMULA[id].gate, angle: FORMULA[id].scale * evaluate(arg.replace(/π/g, 'pi')) };
    } catch {
      // A formula Qanvas can't evaluate is reported with the other unsupported gates.
    }
  }
  unsupported.add(customNames.get(id) ?? (typeof arg === 'string' ? `${id}(${arg})` : id));
  return null;
}

/** Turns one Quirk column into Qanvas columns; Quirk's controls apply to every gate in their column. */
function convertColumn(cells: Cell[], unsupported: Set<string>): Operation[][] {
  const at = (kind: Cell) => cells.flatMap((cell, q) => (cell === kind ? [q] : []));
  const controls = at('control');
  const swaps = at('swap');
  const measured = at('measure');
  const gates = cells.flatMap((cell, q) => (cell && typeof cell === 'object' ? [{ ...cell, q }] : []));

  if (controls.length === 0) {
    if (swaps.length !== 0 && swaps.length !== 2) unsupported.add('Swap');
    const column: Operation[] = gates.map(({ gate, angle, q }) => ({ gate, targets: [q], ...(angle !== undefined && { angle }) }));
    if (swaps.length === 2) column.push({ gate: 'SWAP', targets: swaps });
    if (measured.length > 0) column.push({ gate: 'M', targets: measured });
    return column.length > 0 ? [column] : [];
  }

  const dots = '•'.repeat(controls.length);
  if (swaps.length > 0) unsupported.add(`${dots}Swap`);
  if (measured.length > 0) unsupported.add(`${dots}Measure`);
  const columns: Operation[][] = [];
  for (const { id, gate, angle, q } of gates) {
    const fits = angle === undefined && ((gate === 'X' && controls.length <= 2) || (gate === 'Z' && controls.length === 1));
    // Written as Quirk draws it, with one dot per control, so the message reads the same in every language.
    if (!fits) unsupported.add(`${dots}${id}`);
    else columns.push([{ gate, targets: [q], controls }]);
  }
  return columns;
}

/**
 * Quirk can start a wire in another state; Qanvas starts every qubit in |0⟩, so leading columns
 * prepare it exactly: |1⟩ = X|0⟩, |+⟩ = H|0⟩, |−⟩ = H X|0⟩, |i⟩ = S H|0⟩, |−i⟩ = S† H|0⟩.
 */
function preparation(init: unknown[]): Operation[][] | null {
  const steps: Record<string, GateName[]> = { '0': [], '1': ['X'], '+': ['H'], '-': ['X', 'H'], i: ['H', 'S'], '-i': ['H', 'Sdg'] };
  const columns: Operation[][] = [[], [], []];
  for (const [q, state] of init.entries()) {
    const gates = steps[String(state)];
    if (!gates) return null;
    // X goes first, H second and S or S† last, so each qubit's gates keep their order.
    for (const gate of gates) columns[gate === 'X' ? 0 : gate === 'H' ? 1 : 2].push({ gate, targets: [q] });
  }
  return columns.filter((column) => column.length > 0);
}

/** The circuit JSON from a Quirk or Quirk-E link (`…#circuit={…}`), or the JSON itself. */
function circuitJson(input: string): unknown {
  const text = input.trim();
  const match = /[#?&]circuit=(.*)$/s.exec(text);
  if (!match) return JSON.parse(text);
  // The JSON may be URL-encoded or not, and other parameters may follow it after an "&".
  const candidates = [match[1], match[1].split('&')[0]].flatMap((raw) => [raw, safeDecode(raw)]);
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next reading.
    }
  }
  throw new Error('not JSON');
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

export function looksLikeQuirk(input: string): boolean {
  return !/\bOPENQASM\b/.test(input) && /[#?&]circuit=/.test(input) || /^\s*\{\s*"cols"/.test(input);
}

export function importQuirk(input: string): QuirkResult {
  let data: { cols?: unknown; init?: unknown; gates?: unknown };
  try {
    data = circuitJson(input) as typeof data;
  } catch {
    return { ok: false, error: { code: 'invalid' } };
  }
  if (typeof data !== 'object' || data === null || !Array.isArray(data.cols) || !data.cols.every(Array.isArray)) return { ok: false, error: { code: 'invalid' } };

  const customNames = new Map<string, string>();
  if (Array.isArray(data.gates)) {
    for (const gate of data.gates as { id?: unknown; name?: unknown }[]) {
      if (typeof gate?.id === 'string') customNames.set(gate.id, typeof gate.name === 'string' && gate.name ? gate.name : gate.id);
    }
  }
  const unsupported = new Set<string>();

  const cols = data.cols as unknown[][];
  let columns: Operation[][];
  try {
    columns = cols.flatMap((col) => convertColumn(col.map((raw) => readCell(raw, customNames, unsupported)), unsupported));
  } catch {
    return { ok: false, error: { code: 'invalid' } };
  }
  const prepared = Array.isArray(data.init) ? preparation(data.init) : [];
  if (prepared === null) return { ok: false, error: { code: 'invalid' } };
  columns = [...prepared, ...columns];
  if (unsupported.size > 0) return { ok: false, error: { code: 'unsupported', detail: [...unsupported].join(', ') } };

  const used = columns.flat().flatMap((op) => [...op.targets, ...(op.controls ?? [])]);
  const qubits = Math.max(1, ...used.map((q) => q + 1));
  if (qubits > MAX_QUBITS) return { ok: false, error: { code: 'too-many-qubits', detail: String(qubits) } };

  const circuit = { qubits, columns };
  const errors = validateCircuit(circuit);
  if (errors.some((e) => e.code === 'after-measure')) return { ok: false, error: { code: 'after-measure' } };
  if (errors.length > 0) return { ok: false, error: { code: 'invalid' } };
  return { ok: true, circuit };
}
