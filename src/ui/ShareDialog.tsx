import { useEffect, useState } from 'react';
import { useEditor } from '../editor/store';
import { useT } from '../i18n/useT';
import { encodeLink, toFile } from '../share/share';
import { Dialog } from './Dialog';

function current() {
  const { circuit, exampleId } = useEditor.getState();
  return { circuit, exampleId };
}

export function ShareDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const [link, setLink] = useState('');
  const [status, setStatus] = useState<'copied' | 'failed' | null>(null);
  useEffect(() => {
    if (!open) return;
    setStatus(null);
    encodeLink(current()).then((hash) => setLink(location.origin + location.pathname + hash));
  }, [open]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
  }

  function download() {
    const shared = current();
    const url = URL.createObjectURL(new Blob([toFile(shared)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${shared.exampleId ?? 'circuit'}.qanvas.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('share.title')}>
      <p className="dialog-intro">{t('share.intro')}</p>
      <div className="field">
        <label htmlFor="share-link">{t('share.link')}</label>
        <div className="field-row">
          <input id="share-link" className="text-input" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className="button button--primary" onClick={copy} disabled={!link}>
            {t('share.copyLink')}
          </button>
        </div>
        <span className="field-help" role="status">
          {status && t(status === 'copied' ? 'share.copied' : 'share.copyFailed')}
        </span>
      </div>
      <section className="dialog-section">
        <h3>{t('share.fileTitle')}</h3>
        <p className="dialog-intro">{t('share.fileHint')}</p>
        <div>
          <button type="button" className="button" onClick={download}>
            {t('share.download')}
          </button>
        </div>
      </section>
    </Dialog>
  );
}
