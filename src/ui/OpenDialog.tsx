import { useState, type ChangeEvent } from 'react';
import { importQasm, type ImportError } from '../code/qasmImport';
import { useEditor } from '../editor/store';
import type { MessageKey } from '../i18n/i18n';
import { useT } from '../i18n/useT';
import { fromFile, type SharedCircuit } from '../share/share';
import { Dialog } from './Dialog';

type Problem = { kind: 'bad-file' } | { kind: 'qasm'; error: ImportError };

function looksLikeQasm(name: string, text: string) {
  return name.toLowerCase().endsWith('.qasm') || /^\s*(\/\/[^\n]*\n\s*)*OPENQASM/.test(text);
}

export function OpenDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const loadCircuit = useEditor((s) => s.loadCircuit);
  const [code, setCode] = useState('');
  const [problem, setProblem] = useState<Problem | null>(null);

  function finish(shared: SharedCircuit) {
    loadCircuit(shared.circuit, shared.exampleId);
    setCode('');
    setProblem(null);
    onClose();
  }

  function fromQasm(text: string) {
    const result = importQasm(text);
    if (result.ok) finish({ circuit: result.circuit, exampleId: null });
    else setProblem({ kind: 'qasm', error: result.error });
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const text = await file.text();
    if (looksLikeQasm(file.name, text)) return fromQasm(text);
    const shared = fromFile(text);
    if (shared) finish(shared);
    else setProblem({ kind: 'bad-file' });
  }

  function message(p: Problem): string {
    if (p.kind === 'bad-file') return t('open.badFile');
    const { code: errorCode, line, detail } = p.error;
    const key: MessageKey = errorCode === 'syntax' && line === undefined ? 'import.error.invalid' : `import.error.${errorCode}`;
    return t(key, { line: line ?? '', detail: detail ?? '' });
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        setProblem(null);
        onClose();
      }}
      title={t('open.title')}
    >
      {problem && (
        <p className="dialog-error" role="alert">
          {message(problem)}
        </p>
      )}
      <section className="dialog-section">
        <h3>{t('open.fileTitle')}</h3>
        <p className="dialog-intro">{t('open.fileHint')}</p>
        <div>
          <label className="button file-button">
            <input type="file" accept=".json,.qasm,application/json,text/plain" onChange={onFile} />
            {t('open.chooseFile')}
          </label>
        </div>
      </section>
      <section className="dialog-section">
        <h3>{t('open.pasteTitle')}</h3>
        <label htmlFor="qasm-input" className="visually-hidden">
          {t('open.pasteLabel')}
        </label>
        <textarea
          id="qasm-input"
          className="text-input code-input"
          rows={8}
          spellCheck={false}
          value={code}
          placeholder={'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\nh q[0];\ncx q[0],q[1];'}
          onChange={(e) => setCode(e.target.value)}
        />
        <div>
          <button type="button" className="button button--primary" disabled={!code.trim()} onClick={() => fromQasm(code)}>
            {t('open.import')}
          </button>
        </div>
      </section>
    </Dialog>
  );
}
