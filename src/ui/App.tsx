import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GateKind } from '../circuit/gates';
import { useEditor } from '../editor/store';
import { useT } from '../i18n/useT';
import { detectLab } from '../lab/lab';
import { useShareLink } from '../share/useShareLink';
import { useSimulation } from '../sim/useSimulation';
import { CircuitView } from './CircuitView';
import { CodePanel } from './CodePanel';
import { announcements, collisionDetection, gridKeyboardCoordinates, type DragData, type DropData } from './dnd';
import { GateIcon } from './GateGlyph';
import { Header } from './Header';
import { Palette } from './Palette';
import { Results } from './Results';

function isTextField(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

function inCircuit(target: EventTarget | null) {
  return target === document.body || (target instanceof HTMLElement && target.closest('.circuit-area') !== null);
}

export function App() {
  const t = useT();
  const language = useEditor((s) => s.language);
  const circuit = useEditor((s) => s.circuit);
  const { result, pending } = useSimulation(circuit);
  useShareLink();
  useEffect(() => {
    detectLab();
  }, []);
  const circuitRef = useRef<HTMLElement>(null);
  const [dragging, setDragging] = useState<GateKind | null>(null);
  const [focusTarget, setFocusTarget] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    // A short press delay keeps the palette scrollable on touch screens.
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: gridKeyboardCoordinates }),
  );

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = t('app.name');
  }, [language, t]);

  // Runs after the edit has rendered, so the gate's new button exists.
  useEffect(() => {
    if (!focusTarget) return;
    document.querySelector<HTMLElement>(focusTarget)?.focus();
    setFocusTarget(null);
  }, [focusTarget]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Dialogs handle their own keys; Escape there must close the dialog, not clear the selection.
      if (dragging || isTextField(event.target) || (event.target instanceof Element && event.target.closest('dialog'))) return;
      const editor = useEditor.getState();
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (mod && key === 'z') editor[event.shiftKey ? 'redo' : 'undo']();
      else if (mod && key === 'y') editor.redo();
      else if (mod && key === 'c' && editor.selection && !window.getSelection()?.toString()) editor.copySelection();
      else if (mod && key === 'v' && editor.clipboard) {
        const at = editor.paste();
        if (at) setFocusTarget(`[data-op="${at.column}:${at.index}"]`);
      } else if ((key === 'delete' || key === 'backspace') && editor.selection && inCircuit(event.target)) {
        editor.removeOperation(editor.selection);
        circuitRef.current?.focus();
      } else if (key === 'escape' && editor.selection) editor.select(null);
      else return;
      event.preventDefault();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dragging]);

  const accessibility = useMemo(
    () => ({
      announcements: announcements(t, ({ column, qubit }: DropData) => t('circuit.cell', { qubit: `q${qubit}`, step: column + 1 })),
      screenReaderInstructions: { draggable: t('dnd.instructions') },
      // Gate buttons are re-created when a gate moves, so focus is placed by hand after each drop.
      restoreFocus: false,
    }),
    [t],
  );

  function onDragStart({ active }: DragStartEvent) {
    setDragging((active.data.current as DragData).kind);
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setDragging(null);
    if (!over) return;
    const drag = active.data.current as DragData;
    const drop = over.data.current as DropData;
    const editor = useEditor.getState();
    if (drag.source === 'palette') {
      const at = editor.placeGate(drag.kind, drop);
      if (at) setFocusTarget(`[data-op="${at.column}:${at.index}"]`);
    } else {
      const at = editor.movePart(drag, drop);
      if (at) setFocusTarget(`[data-part="${at.column}:${at.index}:${drop.qubit}"]`);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      accessibility={accessibility}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className="app">
        <Header />
        <div className="workspace">
          <Palette />
          <main className="main">
            <CircuitView ref={circuitRef} result={result} />
            <CodePanel />
          </main>
          <Results result={result} pending={pending} />
        </div>
      </div>
      <DragOverlay dropAnimation={null}>{dragging && <GateIcon kind={dragging} size="large" />}</DragOverlay>
    </DndContext>
  );
}
