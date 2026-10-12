import { EMPTY_CIRCUIT, useEditor } from '../editor/store';
import { EXAMPLE_IDS, EXAMPLES } from '../examples/examples';
import { useT } from '../i18n/useT';
import { Dialog } from './Dialog';

export function ExamplesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const loadCircuit = useEditor((s) => s.loadCircuit);

  function load(id: (typeof EXAMPLE_IDS)[number] | null) {
    loadCircuit(structuredClone(id ? EXAMPLES[id] : EMPTY_CIRCUIT), id);
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('examples.title')}>
      <p className="dialog-intro">{t('examples.intro')}</p>
      <ul className="example-list">
        {EXAMPLE_IDS.map((id) => (
          <li key={id}>
            <button type="button" className="example-card" onClick={() => load(id)}>
              <span className="example-name">{t(`example.${id}.name`)}</span>
              <span className="example-description">{t(`example.${id}.description`)}</span>
              <span className="example-size">
                {t('examples.size', { qubits: EXAMPLES[id].qubits, steps: EXAMPLES[id].columns.length })}
              </span>
            </button>
          </li>
        ))}
        <li>
          <button type="button" className="example-card" onClick={() => load(null)}>
            <span className="example-name">{t('examples.empty.name')}</span>
            <span className="example-description">{t('examples.empty.description')}</span>
          </button>
        </li>
      </ul>
    </Dialog>
  );
}
