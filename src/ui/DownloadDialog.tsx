import { useEffect, useState } from 'react';
import { notebook, PYTHON_FORMATS, pythonScript, type PythonFormat } from '../code/download';
import { codeText, generateCode, type CodeFormat } from '../code/generate';
import { unchangedExample } from '../examples/examples';
import { useEditor } from '../editor/store';
import { saveNotebook, useLab } from '../lab/lab';
import { useT } from '../i18n/useT';
import { Dialog } from './Dialog';
import { saveFile } from './saveFile';

export function DownloadDialog({ open, onClose, format }: { open: boolean; onClose: () => void; format: CodeFormat }) {
  const t = useT();
  const [framework, setFramework] = useState<PythonFormat>('qiskit');
  const canOpenInLab = useLab((s) => s.lab?.features.includes('notebook') ?? false);
  const [sent, setSent] = useState<{ state: 'sending' } | { state: 'saved'; path: string; url: string } | { state: 'failed' } | null>(null);
  useEffect(() => {
    if (!open) return;
    if (format !== 'qasm') setFramework(format);
    setSent(null);
  }, [open, format]);

  function current() {
    const { circuit, exampleId } = useEditor.getState();
    const example = unchangedExample(circuit, exampleId);
    const name = example ?? 'circuit';
    const title = example ? t(`example.${example}.name`) : t('download.untitled');
    return { circuit, name, notebookText: () => notebook(framework, circuit, t, title) };
  }

  function save(kind: 'notebook' | 'script' | 'qasm') {
    const { circuit, name, notebookText } = current();
    if (kind === 'qasm') return saveFile(`${name}.qasm`, codeText(generateCode('qasm', circuit, t)), 'text/plain');
    if (kind === 'script') return saveFile(`${name}-${framework}.py`, pythonScript(framework, circuit, t), 'text/x-python');
    saveFile(`${name}-${framework}.ipynb`, notebookText(), 'application/x-ipynb+json');
  }

  async function openInLab() {
    const { name, notebookText } = current();
    // Opened before the request: browsers block a window opened after waiting for an answer.
    const tab = window.open('', '_blank');
    setSent({ state: 'sending' });
    try {
      const { path, url } = await saveNotebook(`${name}-${framework}`, notebookText());
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      }
      setSent({ state: 'saved', path, url });
    } catch {
      tab?.close();
      setSent({ state: 'failed' });
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('download.title')}>
      <p className="dialog-intro">{t('download.intro')}</p>
      <fieldset className="choices">
        <legend>{t('download.framework')}</legend>
        {PYTHON_FORMATS.map((f) => (
          <label key={f} className="choice">
            <input type="radio" name="download-framework" value={f} checked={framework === f} onChange={() => setFramework(f)} />
            {t(`code.format.${f}`)}
          </label>
        ))}
      </fieldset>
      <div className="field-row">
        {canOpenInLab && (
          <button type="button" className="button button--primary" disabled={sent?.state === 'sending'} onClick={openInLab}>
            {t('lab.openNotebook')}
          </button>
        )}
        <button type="button" className={canOpenInLab ? 'button' : 'button button--primary'} onClick={() => save('notebook')}>
          {t('download.notebook')}
        </button>
        <button type="button" className="button" onClick={() => save('script')}>
          {t('download.script')}
        </button>
      </div>
      {canOpenInLab && (
        <p className="field-help" role="status">
          {sent?.state === 'sending' && t('lab.sending')}
          {sent?.state === 'failed' && t('lab.failed')}
          {sent?.state === 'saved' && (
            <>
              {t('lab.saved', { path: sent.path })}{' '}
              <a href={sent.url} target="_blank" rel="noreferrer">
                {t('lab.openLink')}
              </a>
            </>
          )}
        </p>
      )}
      <section className="dialog-section">
        <h3>{t('download.qasmTitle')}</h3>
        <p className="dialog-intro">{t('download.qasmHint')}</p>
        <div>
          <button type="button" className="button" onClick={() => save('qasm')}>
            {t('download.qasm')}
          </button>
        </div>
      </section>
    </Dialog>
  );
}
