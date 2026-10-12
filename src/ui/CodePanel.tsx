import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { CODE_FORMATS, codeText, generateCode, type CodeFormat } from '../code/generate';
import { currentStep, useEditor } from '../editor/store';
import { useT } from '../i18n/useT';

const FORMAT_KEY = 'qanvas.codeFormat';

const TOKENS = /(#.*$|\/\/.*$)|("[^"]*")|\b(from|import|OPENQASM|include|qreg|creg|gate|measure)\b|(\b\d+(?:\.\d+)?(?:e[-+]?\d+)?\b)/g;
const TOKEN_CLASSES = ['code-comment', 'code-string', 'code-keyword', 'code-number'];

function highlight(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKENS)) {
    const kind = match.slice(1).findIndex((group) => group !== undefined);
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(
      <span key={match.index} className={TOKEN_CLASSES[kind]}>
        {match[0]}
      </span>,
    );
    last = match.index + match[0].length;
  }
  parts.push(text.slice(last));
  return parts;
}

function initialFormat(): CodeFormat {
  try {
    const saved = localStorage.getItem(FORMAT_KEY) as CodeFormat | null;
    if (saved && CODE_FORMATS.includes(saved)) return saved;
  } catch {
    // Falls back to Qiskit when storage is blocked.
  }
  return 'qiskit';
}

export function CodePanel() {
  const t = useT();
  const circuit = useEditor((s) => s.circuit);
  const step = useEditor(currentStep);
  const showCurrent = useEditor((s) => s.learnMode || s.step !== null);
  const [format, setFormat] = useState(initialFormat);
  const [copyStatus, setCopyStatus] = useState<'copied' | 'failed' | null>(null);
  const tabs = useRef<Record<string, HTMLButtonElement | null>>({});
  const view = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => generateCode(format, circuit, t), [format, circuit, t]);
  const firstCurrent = showCurrent && step > 0 ? lines.findIndex((line) => line.column === step - 1) : -1;

  function choose(next: CodeFormat) {
    setFormat(next);
    setCopyStatus(null);
    try {
      localStorage.setItem(FORMAT_KEY, next);
    } catch {
      // Not remembering the choice is fine.
    }
  }

  function onTabKey(event: KeyboardEvent) {
    const i = CODE_FORMATS.indexOf(format);
    const n = CODE_FORMATS.length;
    const target = ({ ArrowRight: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, Home: 0, End: n - 1 } as Record<string, number>)[event.key];
    if (target === undefined) return;
    event.preventDefault();
    choose(CODE_FORMATS[target]);
    tabs.current[CODE_FORMATS[target]]?.focus();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(codeText(lines));
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  }

  useEffect(() => {
    if (!copyStatus) return;
    const timer = setTimeout(() => setCopyStatus(null), 2000);
    return () => clearTimeout(timer);
  }, [copyStatus]);

  // Scrolls the code box, not the page, so the current line stays in sight.
  useEffect(() => {
    const box = view.current;
    const line = box?.querySelector<HTMLElement>('[data-current]');
    if (!box || !line) return;
    const top = line.offsetTop - box.offsetTop;
    if (top < box.scrollTop || top + line.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = top - box.clientHeight / 3;
  }, [firstCurrent, format]);

  return (
    <section className="code-panel" aria-label={t('code.label')}>
      <div className="code-toolbar">
        <div role="tablist" aria-label={t('code.formats')} className="code-tabs">
          {CODE_FORMATS.map((f) => (
            <button
              key={f}
              ref={(node) => {
                tabs.current[f] = node;
              }}
              type="button"
              role="tab"
              id={`code-tab-${f}`}
              aria-selected={f === format}
              aria-controls="code-view"
              tabIndex={f === format ? 0 : -1}
              className="code-tab"
              onClick={() => choose(f)}
              onKeyDown={onTabKey}
            >
              {t(`code.format.${f}`)}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <span className="code-status" role="status">
          {copyStatus && t(copyStatus === 'copied' ? 'code.copied' : 'code.copyFailed')}
        </span>
        <button type="button" className="button button--small" onClick={copy}>
          {t('code.copy')}
        </button>
      </div>
      <div ref={view} id="code-view" role="tabpanel" aria-labelledby={`code-tab-${format}`} tabIndex={0} className="code-view">
        <pre>
          <code>
            {lines.map((line, k) => {
              const current = showCurrent && step > 0 && line.column === step - 1;
              const future = line.column !== undefined && line.column >= step;
              return (
                <span key={k} className="code-line" data-current={current || undefined} data-future={future || undefined}>
                  <span className="code-text">{line.text ? highlight(line.text) : ' '}</span>
                  {k === firstCurrent && <span className="code-step-tag">{t('code.stepTag', { step })}</span>}
                </span>
              );
            })}
          </code>
        </pre>
      </div>
    </section>
  );
}
