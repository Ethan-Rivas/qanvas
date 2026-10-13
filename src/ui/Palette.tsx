import { useDraggable } from '@dnd-kit/core';
import { useState } from 'react';
import { GATE_SYMBOL, type GateKind } from '../circuit/gates';
import { useEditor } from '../editor/store';
import { isExampleId } from '../examples/examples';
import type { MessageKey } from '../i18n/i18n';
import { useT } from '../i18n/useT';
import type { DragData } from './dnd';
import { GateIcon } from './GateGlyph';

const GROUPS: { title: MessageKey; layout: 'cards' | 'grid'; kinds: GateKind[] }[] = [
  { title: 'palette.group.basics', layout: 'cards', kinds: ['H', 'X', 'Y', 'Z'] },
  { title: 'palette.group.phaseRotation', layout: 'grid', kinds: ['S', 'Sdg', 'T', 'Tdg', 'P', 'RX', 'RY', 'RZ'] },
  { title: 'palette.group.multiMeasure', layout: 'cards', kinds: ['CNOT', 'CZ', 'SWAP', 'CCX', 'M', 'RESET'] },
];

function normalize(text: string) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function PaletteGate({ kind, layout }: { kind: GateKind; layout: 'cards' | 'grid' }) {
  const t = useT();
  const learnMode = useEditor((s) => s.learnMode);
  const data: DragData = { source: 'palette', kind };
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `palette:${kind}`, data });
  const name = t(`gate.${kind}.name`);
  const hint = t(`gate.${kind}.hint`);

  if (layout === 'grid') {
    return (
      <button
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        type="button"
        className="palette-chip"
        data-dragging={isDragging || undefined}
        aria-label={`${GATE_SYMBOL[kind]}, ${name}: ${hint}`}
        title={`${name}: ${hint}`}
      >
        <GateIcon kind={kind} />
      </button>
    );
  }
  return (
    <button ref={setNodeRef} {...attributes} {...listeners} type="button" className="palette-card" data-dragging={isDragging || undefined}>
      <GateIcon kind={kind} />
      <span className="palette-card-text">
        <span className="palette-card-name">{name}</span>
        {learnMode && <span className="palette-card-hint">{hint}</span>}
      </span>
    </button>
  );
}

function TryThis() {
  const t = useT();
  const learnMode = useEditor((s) => s.learnMode);
  const exampleId = useEditor((s) => s.exampleId);
  if (!learnMode || !isExampleId(exampleId)) return null;
  return (
    <section className="try-this" aria-labelledby="try-this-title">
      <h2 id="try-this-title">{t('tryThis.title')}</h2>
      <p>{t(`example.${exampleId}.tryThis`)}</p>
    </section>
  );
}

export function Palette() {
  const t = useT();
  const [query, setQuery] = useState('');
  const q = normalize(query.trim());
  const matches = (kind: GateKind) =>
    !q || [GATE_SYMBOL[kind], t(`gate.${kind}.name`), t(`gate.${kind}.hint`)].some((text) => normalize(text).includes(q));
  const groups = GROUPS.map((g) => ({ ...g, kinds: g.kinds.filter(matches) })).filter((g) => g.kinds.length > 0);

  return (
    <aside className="palette" aria-label={t('palette.label')}>
      <label className="palette-search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <span className="visually-hidden">{t('palette.search')}</span>
        <input type="search" value={query} placeholder={t('palette.search')} onChange={(e) => setQuery(e.target.value)} />
      </label>

      {groups.map((group) => (
        <section key={group.title} className="palette-group" aria-labelledby={group.title}>
          <h2 id={group.title} className="palette-group-title">
            {t(group.title)}
          </h2>
          <div className={group.layout === 'grid' ? 'palette-grid' : 'palette-cards'}>
            {group.kinds.map((kind) => (
              <PaletteGate key={kind} kind={kind} layout={group.layout} />
            ))}
          </div>
        </section>
      ))}
      {groups.length === 0 && <p className="palette-empty">{t('palette.noMatch', { query })}</p>}
      <TryThis />
    </aside>
  );
}
