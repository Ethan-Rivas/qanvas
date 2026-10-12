import { useEffect, useRef, useState, type RefObject } from 'react';
import { MAX_QUBITS, type Circuit } from '../circuit/model';
import { codeText, generateCode } from '../code/generate';
import type { ImportError } from '../code/qasmImport';
import { readQasmEdit } from '../editor/qasmEdit';
import { useEditor } from '../editor/store';
import type { MessageKey } from '../i18n/i18n';
import { useT } from '../i18n/useT';

const PAUSE_MS = 500;

/** `flush` applies typing that hasn't been applied yet and says whether the code is valid. */
export function QasmEditor({ flush }: { flush: RefObject<(() => boolean) | null> }) {
  const t = useT();
  const circuit = useEditor((s) => s.circuit);
  const generated = () => codeText(generateCode('qasm', useEditor.getState().circuit, t));
  // `dirty` marks text the user typed; text rewritten from the circuit is never applied back.
  const [draft, setDraft] = useState(() => ({ text: generated(), dirty: false }));
  const [error, setError] = useState<ImportError | null>(null);
  const shown = useRef<Circuit>(circuit);
  const latest = useRef({ draft, error });
  latest.current = { draft, error };

  function apply(text: string): ImportError | null {
    const { circuit: current, exampleId, loadCircuit } = useEditor.getState();
    const result = readQasmEdit(text, current, t);
    const problem = result.ok ? null : result.error;
    if (result.ok && result.circuit) {
      loadCircuit(result.circuit, exampleId);
      shown.current = useEditor.getState().circuit;
    }
    setError(problem);
    setDraft((d) => (d.text === text ? { ...d, dirty: false } : d));
    return problem;
  }

  useEffect(() => {
    flush.current = () => {
      const { draft: d, error: e } = latest.current;
      return (d.dirty ? apply(d.text) : e) === null;
    };
    return () => {
      flush.current = null;
    };
  });

  // An undo or a change made in the diagram while editing replaces the text with the new circuit's code.
  useEffect(() => {
    if (circuit === shown.current) return;
    shown.current = circuit;
    if (draft.dirty) return;
    setDraft({ text: generated(), dirty: false });
    setError(null);
  }, [circuit]);

  useEffect(() => {
    if (!draft.dirty) return;
    const timer = setTimeout(() => apply(draft.text), PAUSE_MS);
    return () => clearTimeout(timer);
  }, [draft]);

  function message(e: ImportError): string {
    const key: MessageKey = e.code === 'syntax' && e.line === undefined ? 'import.error.invalid' : `import.error.${e.code}`;
    return t(key, { line: e.line ?? '', detail: e.detail ?? '', max: MAX_QUBITS });
  }

  return (
    <div className="qasm-editor">
      <label htmlFor="qasm-editor" className="visually-hidden">
        {t('code.editLabel')}
      </label>
      <textarea
        id="qasm-editor"
        className="qasm-editor-input"
        spellCheck={false}
        autoFocus
        rows={draft.text.split('\n').length + 1}
        value={draft.text}
        aria-describedby="qasm-editor-status"
        onChange={(e) => setDraft({ text: e.target.value, dirty: true })}
      />
      <p id="qasm-editor-status" className="qasm-editor-status" role="status" data-error={error ? true : undefined}>
        {error ? `${message(error)} ${t('code.keptCircuit')}` : t('code.editHint')}
      </p>
    </div>
  );
}
