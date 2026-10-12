import { formatAngle } from '../circuit/angle';
import { GATE_SYMBOL, kindOf, type GateKind } from '../circuit/gates';
import type { Circuit, Operation } from '../circuit/model';
import { pluralKey, type Language, type MessageKey, type Translate } from '../i18n/i18n';
import { blochVector, formatState, isEntangled, sameState, sameUpToPhase } from '../sim/analysis';
import type { StateVector } from '../sim/simulator';

export interface StepExplanation {
  label: string;
  title: string;
  sentences: string[];
  before: string;
  after: string;
}

const SINGLE_QUBIT = new Set<GateKind>(['H', 'X', 'Y', 'Z', 'S', 'Sdg', 'T', 'Tdg', 'P', 'RX', 'RY', 'RZ']);

function list(language: Language, qubits: number[]): string {
  return new Intl.ListFormat(language, { type: 'conjunction' }).format(qubits.map((q) => `q${q}`));
}

/** A short name for a column, as on the step slider: "H", "CNOT", "Measure" or "3 gates". */
export function columnLabel(column: Operation[], t: Translate, language: Language): string {
  const kinds = [...new Set(column.map(kindOf))];
  if (kinds.length > 1) return t(pluralKey(language, 'learn.gates', column.length), { count: column.length });
  return kinds[0] === 'M' ? t('gate.M.name') : GATE_SYMBOL[kinds[0]];
}

/** Single-qubit gates of the same kind and angle are described together: "Turns q0 and q1 …". */
function groups(column: Operation[]): Operation[][] {
  const result: Operation[][] = [];
  for (const op of column) {
    const kind = kindOf(op);
    const same = SINGLE_QUBIT.has(kind) && result.find((g) => kindOf(g[0]) === kind && g[0].angle === op.angle);
    if (same) same.push(op);
    else result.push([op]);
  }
  return result;
}

function describe(group: Operation[], t: Translate, language: Language): string {
  const op = group[0];
  const kind = kindOf(op);
  const controls = op.controls ?? [];
  const values = {
    q: list(language, group.flatMap((g) => g.targets)),
    t: `q${op.targets[op.targets.length - 1]}`,
    c: `q${controls[0]}`,
    c1: `q${controls[0]}`,
    c2: `q${controls[1]}`,
    a: `q${kind === 'CZ' ? controls[0] : op.targets[0]}`,
    b: `q${op.targets[kind === 'CZ' ? 0 : 1]}`,
    angle: op.angle === undefined ? '' : formatAngle(op.angle),
  };
  return t(`learn.${kind}.body` as MessageKey, values);
}

function entanglementSentences(before: StateVector, after: StateVector, t: Translate, language: Language): string[] {
  const became: number[] = [];
  const stopped: number[] = [];
  for (let q = 0; q < after.qubits; q++) {
    const was = isEntangled(blochVector(before, q));
    const is = isEntangled(blochVector(after, q));
    if (!was && is) became.push(q);
    if (was && !is) stopped.push(q);
  }
  const sentences: string[] = [];
  if (became.length > 0) sentences.push(t(pluralKey(language, 'learn.entangled', became.length), { q: list(language, became) }));
  if (stopped.length > 0) sentences.push(t(pluralKey(language, 'learn.disentangled', stopped.length), { q: list(language, stopped) }));
  return sentences;
}

/** Explains column `step − 1`, given the states before and after it. */
export function explainStep(
  circuit: Circuit,
  step: number,
  before: StateVector,
  after: StateVector,
  t: Translate,
  language: Language,
): StepExplanation {
  const column = circuit.columns[step - 1];
  const kinds = new Set(column.map(kindOf));
  const title = column.length === 1 ? t(`learn.${kindOf(column[0])}.title` as MessageKey) : t('learn.many.title', { count: column.length });

  const sentences = groups(column).map((group) => describe(group, t, language));
  // A measurement leaves the shown state as it is on purpose, so "nothing changed" would mislead.
  if (!kinds.has('M') || kinds.size > 1) {
    if (sameState(before, after)) sentences.push(t('learn.unchanged'));
    else if (sameUpToPhase(before, after)) sentences.push(t('learn.globalPhase'));
    else sentences.push(...entanglementSentences(before, after, t, language));
  }

  return { label: columnLabel(column, t, language), title, sentences, before: formatState(before), after: formatState(after) };
}
