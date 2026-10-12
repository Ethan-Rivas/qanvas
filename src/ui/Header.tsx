import { useState } from 'react';
import { useEditor } from '../editor/store';
import { isExampleId } from '../examples/examples';
import { LANGUAGES } from '../i18n/i18n';
import { useT } from '../i18n/useT';
import { ExamplesDialog } from './ExamplesDialog';
import { OpenDialog } from './OpenDialog';
import { ShareDialog } from './ShareDialog';

export function Header() {
  const t = useT();
  const language = useEditor((s) => s.language);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const learnMode = useEditor((s) => s.learnMode);
  const exampleId = useEditor((s) => s.exampleId);
  const [dialog, setDialog] = useState<'examples' | 'open' | 'share' | null>(null);
  const { undo, redo, setLanguage, setLearnMode } = useEditor.getState();

  return (
    <header className="header">
      <div className="brand">
        <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
          <rect x="1" y="1" width="24" height="24" rx="7" className="brand-mark" />
          <circle cx="13" cy="13" r="5.5" fill="none" className="brand-mark-line" strokeWidth="2" />
          <path d="M16.5 16.5 L20 20" className="brand-mark-line" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <h1>{t('app.name')}</h1>
      </div>
      {isExampleId(exampleId) && (
        <>
          <span className="header-divider" aria-hidden="true" />
          <span className="header-title">{t(`example.${exampleId}.name`)}</span>
        </>
      )}
      <div className="spacer" />
      <div className="header-group">
        <button type="button" className="icon-button" aria-label={t('header.undo')} title={t('header.undo')} aria-keyshortcuts="Control+Z Meta+Z" onClick={undo} disabled={!canUndo}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M9 14 4 9l5-5" />
            <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
          </svg>
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={t('header.redo')}
          title={t('header.redo')}
          aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y"
          onClick={redo}
          disabled={!canRedo}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="m15 14 5-5-5-5" />
            <path d="M20 9H9a5 5 0 0 0 0 10h3" />
          </svg>
        </button>
      </div>
      <div className="header-group">
        <label className="learn-toggle">
          <input type="checkbox" role="switch" checked={learnMode} onChange={(e) => setLearnMode(e.target.checked)} />
          <span className="switch" aria-hidden="true" />
          {t('header.learnMode')}
        </label>
        <div role="group" aria-label={t('header.language')} className="segmented">
          {LANGUAGES.map((l) => (
            <button key={l} type="button" lang={l} aria-label={t(`language.${l}`)} aria-pressed={l === language} onClick={() => setLanguage(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div className="header-group">
        <button type="button" className="button" onClick={() => setDialog('examples')}>
          {t('header.examples')}
        </button>
        <button type="button" className="button" onClick={() => setDialog('open')}>
          {t('header.open')}
        </button>
        <button type="button" className="button button--primary" onClick={() => setDialog('share')}>
          {t('header.share')}
        </button>
      </div>
      <ExamplesDialog open={dialog === 'examples'} onClose={() => setDialog(null)} />
      <OpenDialog open={dialog === 'open'} onClose={() => setDialog(null)} />
      <ShareDialog open={dialog === 'share'} onClose={() => setDialog(null)} />
    </header>
  );
}
