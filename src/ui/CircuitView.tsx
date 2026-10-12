import { useDraggable, useDroppable } from '@dnd-kit/core';
import { forwardRef, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { formatAngle, parseAngle } from '../circuit/angle';
import type { OpLocation } from '../circuit/edits';
import { hasAngle, kindOf, type GateKind } from '../circuit/gates';
import { BROWSER_QUBITS, operationQubits, type Circuit, type Operation } from '../circuit/model';
import { currentStep, useEditor, type Notice } from '../editor/store';
import { pluralKey, type Language, type MessageKey, type Translate } from '../i18n/i18n';
import { useT } from '../i18n/useT';
import { qubitLimit, useLab } from '../lab/lab';
import type { SimulationResult } from '../sim/useSimulation';
import { cellId, type DragData, type DropData } from './dnd';
import { PartGlyph, type PartShape } from './GateGlyph';
import { StepCallout, Stepper } from './Stepper';

const MIN_COLUMNS = 6;

const NOTICE_KEYS: Partial<Record<Notice, MessageKey>> = {
  'bad-link': 'error.bad-link',
  'after-measure': 'error.after-measure',
  'too-few-qubits': 'error.too-few-qubits',
  'too-many-qubits': 'error.too-many-qubits',
};

interface Part {
  column: number;
  index: number;
  qubit: number;
  op: Operation;
  kind: GateKind;
  shape: PartShape;
  role: 'control' | 'target';
}

function partsOf(circuit: Circuit): Map<string, Part> {
  const parts = new Map<string, Part>();
  circuit.columns.forEach((column, c) =>
    column.forEach((op, index) => {
      const kind = kindOf(op);
      const add = (qubit: number, role: Part['role'], shape: PartShape) =>
        parts.set(`${c}:${qubit}`, { column: c, index, qubit, op, kind, shape, role });

      op.controls?.forEach((q) => add(q, 'control', 'control'));
      for (const q of op.targets) {
        if (kind === 'SWAP') add(q, 'target', 'swap');
        else if (kind === 'CZ') add(q, 'target', 'control');
        else if (kind === 'CNOT' || kind === 'CCX') add(q, 'target', 'oplus');
        else add(q, 'target', 'box');
      }
    }),
  );
  return parts;
}

export function gateLabel(t: Translate, op: Operation): string {
  const name = t(`gate.${kindOf(op)}.name`);
  return op.angle === undefined ? name : `${name} ${formatAngle(op.angle)}`;
}

function partLabel(t: Translate, part: Part): string {
  const values = { gate: gateLabel(t, part.op), qubit: `q${part.qubit}`, step: part.column + 1 };
  return operationQubits(part.op).length > 1 ? t('circuit.gatePart', { ...values, part: t(`part.${part.role}`) }) : t('circuit.gate', values);
}

type Timeline = 'past' | 'future';

function describeOperation(t: Translate, language: Language, op: Operation): string {
  const list = (qs: number[]) => new Intl.ListFormat(language, { type: 'conjunction' }).format(qs.map((q) => `q${q}`));
  const kind = kindOf(op);
  if (kind === 'CNOT' || kind === 'CCX') {
    const controls = op.controls ?? [];
    return t(pluralKey(language, 'a11y.controlled', controls.length), { gate: gateLabel(t, op), controls: list(controls), target: `q${op.targets[0]}` });
  }
  return t('a11y.on', { gate: gateLabel(t, op), qubits: list(operationQubits(op)) });
}

/** A text version of the whole circuit for screen readers, step by step. */
function CircuitSummary({ circuit }: { circuit: Circuit }) {
  const t = useT();
  const language = useEditor((s) => s.language);
  return (
    <section className="visually-hidden" aria-labelledby="circuit-summary">
      <h2 id="circuit-summary">{t('a11y.summary')}</h2>
      {circuit.columns.length === 0 ? (
        <p>{t('a11y.empty')}</p>
      ) : (
        <ol>
          {circuit.columns.map((column, c) => (
            <li key={c}>{t('a11y.step', { step: c + 1, gates: column.map((op) => describeOperation(t, language, op)).join('; ') })}</li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Cell({ column, qubit, timeline, children }: { column: number; qubit: number; timeline: Timeline; children?: ReactNode }) {
  const data: DropData = { column, qubit };
  const { setNodeRef, isOver } = useDroppable({ id: cellId(column, qubit), data });
  return (
    <div
      ref={setNodeRef}
      className="cell"
      data-column={column}
      data-qubit={qubit}
      data-timeline={timeline}
      data-over={isOver || undefined}
      style={{ gridColumn: column + 2, gridRow: qubit + 1 }}
    >
      {children}
    </div>
  );
}

function PartButton({ part, selected }: { part: Part; selected: boolean }) {
  const t = useT();
  const select = useEditor((s) => s.select);
  const { column, index, qubit, kind } = part;
  const data: DragData = { source: 'circuit', kind, column, index, qubit };
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `part:${column}:${index}:${qubit}`,
    data,
    attributes: { roleDescription: t('dnd.roleDescription') },
  });
  const location = { column, index };

  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      type="button"
      className="part"
      data-shape={part.shape}
      data-selected={selected || undefined}
      data-dragging={isDragging || undefined}
      data-op={`${column}:${index}`}
      data-part={`${column}:${index}:${qubit}`}
      aria-label={partLabel(t, part)}
      onFocus={() => select(location)}
      onClick={() => select(location)}
    >
      <PartGlyph kind={kind} shape={part.shape} angle={part.shape === 'box' ? part.op.angle : undefined} />
    </button>
  );
}

function AngleField({ at, op }: { at: OpLocation; op: Operation }) {
  const t = useT();
  const setAngle = useEditor((s) => s.setAngle);
  const [draft, setDraft] = useState(formatAngle(op.angle ?? 0));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setDraft(formatAngle(op.angle ?? 0));
    setInvalid(false);
  }, [op.angle]);

  function commit() {
    const angle = parseAngle(draft);
    setInvalid(angle === null);
    if (angle !== null && angle !== op.angle) setAngle(at, angle);
  }

  return (
    <div className="angle-field">
      <label htmlFor="angle-input">{t('circuit.angle')}</label>
      <input
        id="angle-input"
        value={draft}
        inputMode="text"
        spellCheck={false}
        aria-invalid={invalid || undefined}
        aria-describedby="angle-help"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
      <span id="angle-help" className={invalid ? 'field-error' : 'field-help'}>
        {t(invalid ? 'circuit.angleInvalid' : 'circuit.angleHelp')}
      </span>
    </div>
  );
}

function Inspector({ circuit, onDeleted }: { circuit: Circuit; onDeleted: () => void }) {
  const t = useT();
  const selection = useEditor((s) => s.selection);
  const removeOperation = useEditor((s) => s.removeOperation);
  const op = selection && circuit.columns[selection.column]?.[selection.index];

  if (!selection || !op) {
    return circuit.columns.length === 0 ? <p className="inspector-hint">{t('circuit.emptyHint')}</p> : null;
  }
  return (
    <div className="inspector">
      <div className="inspector-text">
        <span className="inspector-title">{t('circuit.selected', { gate: gateLabel(t, op) })}</span>
        <span className="inspector-hint">{t('circuit.selectedHint')}</span>
      </div>
      {hasAngle(kindOf(op)) && <AngleField key={`${selection.column}:${selection.index}`} at={selection} op={op} />}
      <button
        type="button"
        className="button"
        onClick={() => {
          removeOperation(selection);
          onDeleted();
        }}
      >
        {t('circuit.delete')}
      </button>
    </div>
  );
}

export const CircuitView = forwardRef<HTMLElement, { result: SimulationResult | null }>(function CircuitView({ result }, ref) {
  const t = useT();
  const language = useEditor((s) => s.language);
  const circuit = useEditor((s) => s.circuit);
  const selection = useEditor((s) => s.selection);
  const notice = useEditor((s) => s.notice);
  const learnMode = useEditor((s) => s.learnMode);
  const step = useEditor(currentStep);
  const stepping = useEditor((s) => s.step !== null);
  const { addQubit, removeQubit, dismissNotice } = useEditor.getState();
  const limit = qubitLimit(useLab((s) => s.lab));
  const cardRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const parts = partsOf(circuit);
  const columnCount = Math.max(circuit.columns.length + 1, MIN_COLUMNS);
  const qubits = Array.from({ length: circuit.qubits }, (_, q) => q);
  const isSelected = (p: Part) => selection?.column === p.column && selection.index === p.index;
  const focusSelf = () => (ref && 'current' in ref ? ref.current?.focus() : undefined);
  const highlight = learnMode || stepping;
  const timeline = (c: number): Timeline => (c >= step && c < circuit.columns.length ? 'future' : 'past');

  // Keeps the current column visible while stepping through a wide circuit.
  useEffect(() => {
    if (!stepping || step === 0) return;
    const cell = scrollRef.current?.querySelector<HTMLElement>(`.cell[data-column="${step - 1}"]`);
    const scroller = scrollRef.current;
    if (!cell || !scroller) return;
    const left = cell.offsetLeft - scroller.offsetLeft;
    if (left < scroller.scrollLeft || left + cell.offsetWidth > scroller.scrollLeft + scroller.clientWidth) {
      scroller.scrollLeft = left - scroller.clientWidth / 2 + cell.offsetWidth / 2;
    }
  }, [step, stepping]);

  return (
    <section ref={ref} className="circuit-area" aria-label={t('circuit.label')} tabIndex={-1}>
      <div className="circuit-toolbar">
        <span className="circuit-summary">
          {t(pluralKey(language, 'circuit.qubits', circuit.qubits), { count: circuit.qubits })} ·{' '}
          {t(pluralKey(language, 'circuit.steps', circuit.columns.length), { count: circuit.columns.length })}
        </span>
        <div className="notice-slot" role="status">
          {notice && (
            <span className="notice">
              {t(NOTICE_KEYS[notice] ?? 'error.other', { max: limit })}
              <button type="button" className="notice-dismiss" onClick={dismissNotice} aria-label={t('notice.dismiss')}>
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                  <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </span>
          )}
        </div>
        <button type="button" className="button" onClick={addQubit} disabled={circuit.qubits >= limit}>
          + {t('circuit.addQubit')}
        </button>
      </div>

      <CircuitSummary circuit={circuit} />
      <div ref={cardRef} className="circuit-card" style={{ '--step': step } as CSSProperties}>
        <div
          ref={scrollRef}
          className="circuit-scroll"
          onScroll={(e) => cardRef.current?.style.setProperty('--scroll-x', `${e.currentTarget.scrollLeft}px`)}
        >
          <div className="circuit-grid" data-compact={circuit.qubits > BROWSER_QUBITS || undefined} style={{ gridTemplateColumns: `var(--label-width) repeat(${columnCount}, var(--cell-width))` }}>
            {qubits.map((q) => (
              <div key={`label-${q}`} className="qubit-label" style={{ gridRow: q + 1, gridColumn: 1 }}>
                <span>q{q}</span>
                <span className="ket">|0⟩</span>
                {circuit.qubits > 1 && (
                  <button
                    type="button"
                    className="icon-button remove-qubit"
                    aria-label={t('circuit.removeQubit', { qubit: `q${q}` })}
                    onClick={() => {
                      removeQubit(q);
                      focusSelf();
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">
                      <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </div>
            ))}

            {highlight && step > 0 && (
              <div className="step-highlight" aria-hidden="true" style={{ gridColumn: step + 1, gridRow: `1 / ${circuit.qubits + 1}` }} />
            )}

            {circuit.columns.map((column, c) =>
              column.map((op, i) => {
                const qs = operationQubits(op);
                if (qs.length < 2) return null;
                return (
                  <div
                    key={`link-${c}-${i}`}
                    className="link"
                    data-timeline={timeline(c)}
                    aria-hidden="true"
                    style={{ gridColumn: c + 2, gridRow: `${Math.min(...qs) + 1} / ${Math.max(...qs) + 2}` }}
                  />
                );
              }),
            )}

            {Array.from({ length: columnCount }, (_, c) =>
              qubits.map((q) => {
                const part = parts.get(`${c}:${q}`);
                return (
                  <Cell key={`${c}:${q}`} column={c} qubit={q} timeline={timeline(c)}>
                    {part && <PartButton part={part} selected={isSelected(part)} />}
                  </Cell>
                );
              }),
            )}
          </div>
        </div>
        {learnMode && result && step > 0 && <StepCallout result={result} step={step} />}
        <Inspector circuit={circuit} onDeleted={focusSelf} />
        {circuit.columns.length > 0 && <Stepper />}
      </div>
    </section>
  );
});
