import { useEffect, useState } from 'react';
import { notebook, PYTHON_FORMATS, pythonScript, type PythonFormat } from '../code/download';
import { codeText, generateCode, type CodeFormat } from '../code/generate';
import { isExampleId } from '../examples/examples';
import { useEditor } from '../editor/store';
import { useT } from '../i18n/useT';
import { Dialog } from './Dialog';
import { saveFile } from './saveFile';

export function DownloadDialog({ open, onClose, format }: { open: boolean; onClose: () => void; format: CodeFormat }) {
  const t = useT();
  const [framework, setFramework] = useState<PythonFormat>('qiskit');
  useEffect(() => {
    if (open && format !== 'qasm') setFramework(format);
  }, [open, format]);

  function save(kind: 'notebook' | 'script' | 'qasm') {
    const { circuit, exampleId } = useEditor.getState();
    const name = isExampleId(exampleId) ? exampleId : 'circuit';
    if (kind === 'qasm') return saveFile(`${name}.qasm`, codeText(generateCode('qasm', circuit, t)), 'text/plain');
    if (kind === 'script') return saveFile(`${name}-${framework}.py`, pythonScript(framework, circuit, t), 'text/x-python');
    const title = isExampleId(exampleId) ? t(`example.${exampleId}.name`) : t('download.untitled');
    saveFile(`${name}-${framework}.ipynb`, notebook(framework, circuit, t, title), 'application/x-ipynb+json');
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
        <button type="button" className="button button--primary" onClick={() => save('notebook')}>
          {t('download.notebook')}
        </button>
        <button type="button" className="button" onClick={() => save('script')}>
          {t('download.script')}
        </button>
      </div>
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
