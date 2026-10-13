import { create } from 'zustand';
import * as edits from '../circuit/edits';
import type { Cell, EditError, EditResult, OpLocation } from '../circuit/edits';
import type { GateKind } from '../circuit/gates';
import { validateCircuit, type Circuit, type Condition, type Operation } from '../circuit/model';
import type { ExampleId } from '../examples/examples';
import { qubitLimit, useLab } from '../lab/lab';
import type { Language } from '../i18n/i18n';

const HISTORY_LIMIT = 200;

export type Notice = EditError | 'bad-link';
const LANGUAGE_KEY = 'qanvas.language';
const LEARN_KEY = 'qanvas.learnMode';

/** What undo and redo restore: the circuit and the example it started from, if any. */
interface Snapshot {
  circuit: Circuit;
  exampleId: ExampleId | null;
}

export interface EditorState {
  circuit: Circuit;
  exampleId: ExampleId | null;
  past: Snapshot[];
  future: Snapshot[];
  selection: OpLocation | null;
  clipboard: Operation | null;
  notice: Notice | null;
  language: Language;
  learnMode: boolean;
  /** The step shown by the step-through slider; null follows the end of the circuit as it grows. */
  step: number | null;

  placeGate(kind: GateKind, cell: Cell): OpLocation | null;
  /** Replaces the whole circuit, as one undoable edit. Returns false for an invalid circuit. */
  loadCircuit(circuit: Circuit, exampleId?: ExampleId | null): boolean;
  movePart(from: OpLocation & { qubit: number }, to: Cell): OpLocation | null;
  removeOperation(at: OpLocation): void;
  setAngle(at: OpLocation, angle: number): void;
  setCondition(at: OpLocation, condition: Condition | null): void;
  addQubit(): void;
  removeQubit(qubit: number): void;
  copySelection(): void;
  paste(): OpLocation | null;
  undo(): void;
  redo(): void;
  select(at: OpLocation | null): void;
  dismissNotice(): void;
  setLanguage(language: Language): void;
  setLearnMode(on: boolean): void;
  setStep(step: number | null): void;
}

// Storage can be blocked (private windows, previews); every setting then falls back to its default.
function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembering the choice is fine.
  }
}

function initialLanguage(): Language {
  const saved = load(LANGUAGE_KEY);
  if (saved === 'en' || saved === 'es') return saved;
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en';
}

/** The step to show: `step` when set, otherwise the end of the circuit. */
export function currentStep(state: Pick<EditorState, 'step' | 'circuit'>): number {
  const end = state.circuit.columns.length;
  return state.step === null ? end : Math.min(state.step, end);
}

export const EMPTY_CIRCUIT: Circuit = { qubits: 3, columns: [] };

export const useEditor = create<EditorState>()((set, get) => {
  /** Applies an edit, records it for undo, and returns where the edited gate ended up. */
  function apply(result: EditResult, keepSelection = false): OpLocation | null {
    if (!result.ok) {
      set({ notice: result.error });
      return null;
    }
    const { circuit, exampleId, past } = get();
    if (result.circuit === circuit) return result.at ?? null;
    set({
      circuit: result.circuit,
      past: [...past, { circuit, exampleId }].slice(-HISTORY_LIMIT),
      future: [],
      notice: null,
      selection: result.at ?? (keepSelection ? get().selection : null),
    });
    return result.at ?? null;
  }

  return {
    circuit: EMPTY_CIRCUIT,
    exampleId: null,
    past: [],
    future: [],
    selection: null,
    clipboard: null,
    notice: null,
    language: initialLanguage(),
    learnMode: load(LEARN_KEY) !== 'off',
    step: null,

    placeGate: (kind, cell) => apply(edits.placeGate(get().circuit, kind, cell)),

    loadCircuit(circuit, exampleId = null) {
      if (validateCircuit(circuit).length > 0) return false;
      const { past, ...current } = get();
      set({
        circuit,
        exampleId,
        past: [...past, { circuit: current.circuit, exampleId: current.exampleId }].slice(-HISTORY_LIMIT),
        future: [],
        selection: null,
        notice: null,
        step: null,
      });
      return true;
    },
    movePart: (from, to) => apply(edits.movePart(get().circuit, from, to)),
    removeOperation: (at) => apply(edits.removeOperation(get().circuit, at)),
    setAngle: (at, angle) => apply(edits.setAngle(get().circuit, at, angle)),
    setCondition: (at, condition) => apply(edits.setCondition(get().circuit, at, condition)),
    addQubit: () => apply(edits.addQubit(get().circuit, qubitLimit(useLab.getState().lab)), true),
    removeQubit: (qubit) => apply(edits.removeQubit(get().circuit, qubit)),

    copySelection() {
      const { selection, circuit } = get();
      if (selection) set({ clipboard: circuit.columns[selection.column][selection.index] });
    },

    paste() {
      const { clipboard, selection, circuit } = get();
      if (!clipboard) return null;
      const column = selection ? selection.column + 1 : circuit.columns.length;
      return apply(edits.pasteOperation(circuit, clipboard, column));
    },

    undo() {
      const { past, future, circuit, exampleId } = get();
      if (past.length === 0) return;
      set({ ...past[past.length - 1], past: past.slice(0, -1), future: [{ circuit, exampleId }, ...future], selection: null, notice: null });
    },

    redo() {
      const { past, future, circuit, exampleId } = get();
      if (future.length === 0) return;
      set({ ...future[0], past: [...past, { circuit, exampleId }], future: future.slice(1), selection: null, notice: null });
    },

    select: (selection) => set({ selection }),
    dismissNotice: () => set({ notice: null }),

    setLanguage(language) {
      save(LANGUAGE_KEY, language);
      set({ language });
    },

    setLearnMode(learnMode) {
      save(LEARN_KEY, learnMode ? 'on' : 'off');
      set({ learnMode });
    },

    setStep(step) {
      set({ step: step === null || step >= get().circuit.columns.length ? null : Math.max(0, step) });
    },
  };
});
