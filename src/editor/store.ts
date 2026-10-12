import { create } from 'zustand';
import * as edits from '../circuit/edits';
import type { Cell, EditError, EditResult, OpLocation } from '../circuit/edits';
import type { GateKind } from '../circuit/gates';
import type { Circuit, Operation } from '../circuit/model';
import type { Language } from '../i18n/i18n';

const HISTORY_LIMIT = 200;
const LANGUAGE_KEY = 'qanvas.language';

export interface EditorState {
  circuit: Circuit;
  past: Circuit[];
  future: Circuit[];
  selection: OpLocation | null;
  clipboard: Operation | null;
  notice: EditError | null;
  language: Language;

  placeGate(kind: GateKind, cell: Cell): OpLocation | null;
  movePart(from: OpLocation & { qubit: number }, to: Cell): OpLocation | null;
  removeOperation(at: OpLocation): void;
  setAngle(at: OpLocation, angle: number): void;
  addQubit(): void;
  removeQubit(qubit: number): void;
  copySelection(): void;
  paste(): OpLocation | null;
  undo(): void;
  redo(): void;
  select(at: OpLocation | null): void;
  dismissNotice(): void;
  setLanguage(language: Language): void;
}

function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY);
    if (saved === 'en' || saved === 'es') return saved;
  } catch {
    // Storage can be blocked (private windows, previews); fall back to the browser language.
  }
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en';
}

export const EMPTY_CIRCUIT: Circuit = { qubits: 3, columns: [] };

export const useEditor = create<EditorState>()((set, get) => {
  /** Applies an edit, records it for undo, and returns where the edited gate ended up. */
  function apply(result: EditResult, keepSelection = false): OpLocation | null {
    if (!result.ok) {
      set({ notice: result.error });
      return null;
    }
    const { circuit, past } = get();
    if (result.circuit === circuit) return result.at ?? null;
    set({
      circuit: result.circuit,
      past: [...past, circuit].slice(-HISTORY_LIMIT),
      future: [],
      notice: null,
      selection: result.at ?? (keepSelection ? get().selection : null),
    });
    return result.at ?? null;
  }

  return {
    circuit: EMPTY_CIRCUIT,
    past: [],
    future: [],
    selection: null,
    clipboard: null,
    notice: null,
    language: initialLanguage(),

    placeGate: (kind, cell) => apply(edits.placeGate(get().circuit, kind, cell)),
    movePart: (from, to) => apply(edits.movePart(get().circuit, from, to)),
    removeOperation: (at) => apply(edits.removeOperation(get().circuit, at)),
    setAngle: (at, angle) => apply(edits.setAngle(get().circuit, at, angle)),
    addQubit: () => apply(edits.addQubit(get().circuit), true),
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
      const { past, future, circuit } = get();
      if (past.length === 0) return;
      set({ circuit: past[past.length - 1], past: past.slice(0, -1), future: [circuit, ...future], selection: null, notice: null });
    },

    redo() {
      const { past, future, circuit } = get();
      if (future.length === 0) return;
      set({ circuit: future[0], past: [...past, circuit], future: future.slice(1), selection: null, notice: null });
    },

    select: (selection) => set({ selection }),
    dismissNotice: () => set({ notice: null }),

    setLanguage(language) {
      try {
        localStorage.setItem(LANGUAGE_KEY, language);
      } catch {
        // Not remembering the choice is fine.
      }
      set({ language });
    },
  };
});
