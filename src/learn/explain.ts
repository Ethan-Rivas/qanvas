import { formatAngle } from '../circuit/angle';
import { GATE_SYMBOL, kindOf, type GateKind } from '../circuit/gates';
import { gateError, partwayMeasurements, type Circuit, type Operation } from '../circuit/model';
import { formatPercent, pluralKey, type Language, type MessageKey, type Translate } from '../i18n/i18n';
import { blochVector, formatState, isEntangled, pureVector, sameState, sameUpToPhase } from '../sim/analysis';
import { isMixed, simulate, type QuantumState, type StateVector } from '../sim/simulator';

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
    const same = SINGLE_QUBIT.has(kind) && !op.condition && result.find((g) => !g[0].condition && kindOf(g[0]) === kind && g[0].angle === op.angle);
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
  const body = t(`learn.${kind}.body` as MessageKey, values);
  return op.condition ? `${body} ${t('learn.condition', { q: `q${op.condition.qubit}`, value: op.condition.value })}` : body;
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

function chanceSentences(column: Operation[], before: QuantumState, readout: number, t: Translate, language: Language): string[] {
  return column
    .filter((op) => op.gate === 'M')
    .flatMap((op) => op.targets)
    .map((q) => {
      const one = (1 - blochVector(before, q).z) / 2;
      const readsOne = one * (1 - readout) + (1 - one) * readout;
      if (readsOne < 0.0005 || readsOne > 0.9995) return t('learn.chancesCertain', { q: `q${q}`, value: readsOne < 0.5 ? 0 : 1 });
      return t('learn.chances', { q: `q${q}`, p0: formatPercent(language, 1 - readsOne), p1: formatPercent(language, readsOne) });
    });
}

function gateNoiseSentence(column: Operation[], circuit: Circuit, t: Translate, language: Language): string | null {
  const rates = [...new Set(column.map((op) => gateError(op, circuit.noise)).filter((p) => p > 0))].sort((a, b) => a - b);
  if (rates.length === 0) return null;
  const percent = new Intl.ListFormat(language, { type: 'disjunction' }).format(rates.map((p) => formatPercent(language, p)));
  return t('learn.gateNoise', { percent });
}

/** How many columns at the start keep the state pure: none resets, measures partway through or adds gate noise. */
function pureColumnCount(circuit: Circuit): number {
  const partway = partwayMeasurements(circuit);
  const first = circuit.columns.findIndex((column, c) =>
    column.some((op) => op.gate === 'RESET' || (op.gate === 'M' && op.targets.some((q) => partway.has(`${c}:${q}`))) || gateError(op, circuit.noise) > 0),
  );
  return first === -1 ? circuit.columns.length : first;
}

/** Explains column `step − 1`, given the states before and after it. */
export function explainStep(
  circuit: Circuit,
  step: number,
  before: QuantumState,
  after: QuantumState,
  t: Translate,
  language: Language,
): StepExplanation {
  // A density matrix has no global phase, so the pure steps are replayed on the state vector, to be
  // explained the same way as in a circuit that never needs the density matrix.
  if (isMixed(before) && step <= pureColumnCount(circuit)) {
    const states = simulate({ qubits: circuit.qubits, columns: circuit.columns.slice(0, step) });
    [before, after] = [states[step - 1], states[step]];
  }
  const column = circuit.columns[step - 1];
  const kinds = new Set(column.map(kindOf));
  const title = column.length === 1 ? t(`learn.${kindOf(column[0])}.title` as MessageKey) : t('learn.many.title', { count: column.length });
  const was = pureVector(before);
  const is = pureVector(after);

  const sentences = groups(column).map((group) => describe(group, t, language));
  const readout = circuit.noise?.readout ?? 0;
  sentences.push(...chanceSentences(column, before, readout, t, language));
  if (kinds.has('M') && readout > 0) sentences.push(t('learn.readoutNoise', { percent: formatPercent(language, readout) }));
  const noisy = gateNoiseSentence(column, circuit, t, language);
  if (noisy) sentences.push(noisy);
  // A measurement leaves the shown state as it is on purpose, so "nothing changed" would mislead.
  if (was && is && (!kinds.has('M') || kinds.size > 1)) {
    if (sameState(was, is)) sentences.push(t('learn.unchanged'));
    else if (sameUpToPhase(was, is)) sentences.push(t('learn.globalPhase'));
    else sentences.push(...entanglementSentences(was, is, t, language));
  }
  if (was && !is) {
    const partway = partwayMeasurements(circuit);
    const measuredPartway = column.some((op) => op.gate === 'M' && op.targets.some((q) => partway.has(`${step - 1}:${q}`)));
    if (measuredPartway) sentences.push(t('learn.measuredMix'));
    else if (!kinds.has('RESET')) sentences.push(t('learn.noiseMix'));
  }

  const show = (state: StateVector | null) => (state ? formatState(state) : t('learn.mixed'));
  return { label: columnLabel(column, t, language), title, sentences, before: show(was), after: show(is) };
}
