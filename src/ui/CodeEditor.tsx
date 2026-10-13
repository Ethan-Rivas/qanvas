import { useEffect, useRef, useState, type RefObject } from 'react';
import { MAX_QUBITS, type Circuit } from '../circuit/model';
import { codeText, generateCode, type CodeFormat } from '../code/generate';
import type { ImportError } from '../code/qasmImport';
import { readQasmEdit } from '../editor/qasmEdit';
import { useEditor } from '../editor/store';
import type { MessageKey } from '../i18n/i18n';
import { useT } from '../i18n/useT';
import { importCode, type LabError } from '../lab/lab';

// Python runs in quantum-lab, so it waits a little longer for typing to settle.
const PAUSE_MS = { qasm: 500, python: 900 };

type Problem = { kind: 'qasm'; error: ImportError; fromLab: boolean } | { kind: 'lab'; error: LabError };

/**
 * Edits one code tab. OpenQASM is read in the browser; Qiskit, Cirq and pyQuil are run by
 * quantum-lab, which answers with the circuit as OpenQASM. `flush` applies typing that hasn't
 * been applied and says whether the editor can close; `onApplied` keeps the text the user wrote.
 */
export function CodeEditor({
  format,
  initial,
  flush,
  onApplied,
}: {
  format: CodeFormat;
  initial: string;
  flush: RefObject<(() => boolean) | null>;
  onApplied: (text: string, circuit: Circuit) => void;
}) {
  const t = useT();
  const circuit = useEditor((s) => s.circuit);
  const python = format !== 'qasm';
  const generated = () => codeText(generateCode(format, useEditor.getState().circuit, t));
  // `dirty` marks text the user typed; text rewritten from the circuit is never applied back.
  const [draft, setDraft] = useState(() => ({ text: initial, dirty: false }));
  const [problem, setProblem] = useState<Problem | null>(null);
  const [running, setRunning] = useState(false);
  const shown = useRef<Circuit>(circuit);
  const latest = useRef({ draft, problem, running });
  latest.current = { draft, problem, running };

  /** Loads the circuit OpenQASM describes, unless it's the one already shown. */
  function show(qasm: string, text: string, fromLab: boolean): Problem | null {
    const { circuit: current, exampleId, loadCircuit } = useEditor.getState();
    const result = readQasmEdit(qasm, current, t);
    if (!result.ok) return { kind: 'qasm', error: result.error, fromLab };
    if (result.circuit) loadCircuit(result.circuit, exampleId);
    shown.current = useEditor.getState().circuit;
    onApplied(text, shown.current);
    return null;
  }

  function settle(text: string, next: Problem | null) {
    setProblem(next);
    setDraft((d) => (d.text === text ? { ...d, dirty: false } : d));
  }

  async function apply(text: string) {
    if (!python) return settle(text, show(text, text, false));
    setRunning(true);
    try {
      const { qasm } = await importCode(format as 'qiskit' | 'cirq' | 'pyquil', text);
      // Typing that came in while the lab worked gets its own run; this answer is for older text.
      if (latest.current.draft.text === text) settle(text, show(qasm, text, true));
    } catch (error) {
      if (latest.current.draft.text === text) settle(text, { kind: 'lab', error: error as LabError });
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    flush.current = () => {
      const { draft: d, problem: p, running: r } = latest.current;
      if (d.dirty) {
        if (!python) {
          const next = show(d.text, d.text, false);
          settle(d.text, next);
          return next === null;
        }
        apply(d.text);
        return false;
      }
      return p === null && !r;
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
    setProblem(null);
  }, [circuit]);

  useEffect(() => {
    if (!draft.dirty) return;
    const timer = setTimeout(() => apply(draft.text), python ? PAUSE_MS.python : PAUSE_MS.qasm);
    return () => clearTimeout(timer);
  }, [draft]);

  function message(p: Problem): string {
    if (p.kind === 'qasm') {
      const { code, line, detail } = p.error;
      // Line numbers from the lab's OpenQASM wouldn't match the code on screen.
      if (p.fromLab) return t(`code.lab.qasm.${code === 'classical-control' ? code : 'other'}`, { detail: detail ?? '' });
      const key: MessageKey = code === 'syntax' && line === undefined ? 'import.error.invalid' : `import.error.${code}`;
      return t(key, { line: line ?? '', detail: detail ?? '', max: MAX_QUBITS });
    }
    const { code, detail, line } = p.error;
    if (code === 'python') return line ? t('code.lab.pythonAt', { line, detail: detail ?? '' }) : t('code.lab.python', { detail: detail ?? '' });
    if (code === 'no-circuit') return t(`code.lab.noCircuit.${format as 'qiskit' | 'cirq' | 'pyquil'}`);
    if (code === 'too-many-qubits') return t('code.lab.tooManyQubits', { detail: detail ?? '', max: MAX_QUBITS });
    if (code === 'unsupported') return t('code.lab.unsupported', { detail: detail ?? '' });
    if (code === 'timeout') return t('code.lab.timeout', { seconds: detail ?? '' });
    if (code === 'unreachable') return t('code.lab.unreachable');
    return t('code.lab.failed');
  }

  const status = running ? t('code.lab.running') : problem ? `${message(problem)} ${t('code.keptCircuit')}` : t(python ? 'code.editHintLab' : 'code.editHint');

  return (
    <div className="qasm-editor">
      <label htmlFor="code-editor" className="visually-hidden">
        {t(python ? 'code.editLabelPython' : 'code.editLabel', { framework: t(`code.format.${format}`) })}
      </label>
      <textarea
        id="code-editor"
        className="qasm-editor-input"
        spellCheck={false}
        autoFocus
        rows={draft.text.split('\n').length + 1}
        value={draft.text}
        aria-describedby="code-editor-status"
        onChange={(e) => setDraft({ text: e.target.value, dirty: true })}
      />
      <p id="code-editor-status" className="qasm-editor-status" role="status" data-error={problem && !running ? true : undefined}>
        {status}
      </p>
    </div>
  );
}
