import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Circuit } from '../circuit/model';
import { codeText, generateCode } from '../code/generate';
import { importQasm, type ImportError } from '../code/qasmImport';
import { useEditor } from '../editor/store';
import type { MessageKey } from '../i18n/i18n';
import { useT } from '../i18n/useT';

const PAUSE_MS = 500;

/** Applies the code to the circuit if it reads and differs; returns the error otherwise. */
function apply(text: string): ImportError | null {
  const result = importQasm(text);
  if (!result.ok) return result.error;
  const { circuit, exampleId, loadCircuit } = useEditor.getState();
  if (JSON.stringify(result.circuit) !== JSON.stringify(circuit)) loadCircuit(result.circuit, exampleId);
  return null;
}

export function QasmEditor({ flush }: { flush: RefObject<(() => void) | null> }) {
  const t = useT();
  const circuit = useEditor((s) => s.circuit);
  const generated = () => codeText(generateCode('qasm', useEditor.getState().circuit, t));
  // `dirty` marks text the user typed; text rewritten from the circuit is never applied back.
  const [draft, setDraft] = useState(() => ({ text: generated(), dirty: false }));
  const [error, setError] = useState<ImportError | null>(null);
  const shown = useRef<Circuit>(circuit);

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
    const run = () => {
      const problem = apply(draft.text);
      setError(problem);
      shown.current = useEditor.getState().circuit;
      setDraft((d) => (d.text === draft.text ? { ...d, dirty: false } : d));
    };
    flush.current = run;
    const timer = setTimeout(run, PAUSE_MS);
    return () => {
      clearTimeout(timer);
      flush.current = null;
    };
  }, [draft, flush]);

  function message(e: ImportError): string {
    const key: MessageKey = e.code === 'syntax' && e.line === undefined ? 'import.error.invalid' : `import.error.${e.code}`;
    return t(key, { line: e.line ?? '', detail: e.detail ?? '' });
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
