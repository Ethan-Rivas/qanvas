import { useState } from 'react';
import { BROWSER_QUBITS, type Circuit } from '../circuit/model';
import { codeText, generateCode } from '../code/generate';
import { useEditor } from '../editor/store';
import { useT } from '../i18n/useT';
import { runOnAer, useLab, type LabError } from '../lab/lab';
import { bitOrder, Histogram } from './Results';

const SHOTS = 1000;
const MAX_BARS = 16;
const QUANTUM_LAB = 'https://github.com/Ethan-Rivas/quantum-lab';

type Run = { circuit: Circuit; counts: Record<string, number>; measured: number[] } | { circuit: Circuit; error: LabError };

function order(measured: number[]): string {
  if (measured.every((q, i) => q === i)) return bitOrder(measured.length);
  return measured.length <= 6 ? measured.map((q) => `q${q}`).join(' ') : `q${measured[0]} q${measured[1]} … q${measured.at(-1)}`;
}

/** Results for circuits too large for the browser: Qiskit Aer's counts in quantum-lab, or a note elsewhere. */
export function AerResults() {
  const t = useT();
  const circuit = useEditor((s) => s.circuit);
  const canRun = useLab((s) => s.lab?.features.includes('run') ?? false);
  const [run, setRun] = useState<Run | null>(null);
  const [running, setRunning] = useState(false);
  // A run belongs to the circuit it ran; after an edit the counts would describe another circuit.
  const current = run?.circuit === circuit ? run : null;

  async function start() {
    setRunning(true);
    try {
      const answer = await runOnAer(codeText(generateCode('qasm', circuit, t)), SHOTS);
      setRun({ circuit, ...answer });
    } catch (error) {
      setRun({ circuit, error: error as LabError });
    } finally {
      setRunning(false);
    }
  }

  function failure(error: LabError): string {
    if (error.code === 'timeout') return t('aer.timeout', { seconds: error.detail ?? '' });
    if (error.code === 'unreachable') return t('aer.unreachable');
    return t('aer.failed', { detail: error.detail ?? error.code });
  }

  const bars =
    current && 'counts' in current
      ? Object.entries(current.counts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, MAX_BARS)
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([label, n]) => ({ label, p: n / SHOTS }))
      : [];

  return (
    <aside className="results" aria-label={t('aer.title')}>
      <section className="results-section" aria-labelledby="aer-title">
        <div className="results-heading">
          <h2 id="aer-title">{t('aer.title')}</h2>
        </div>
        {canRun ? (
          <>
            <p className="results-note">{t('aer.intro', { count: circuit.qubits, max: BROWSER_QUBITS, shots: SHOTS })}</p>
            <div>
              <button type="button" className="button button--primary" disabled={running} onClick={start}>
                {t(current ? 'aer.rerun' : 'aer.run')}
              </button>
            </div>
            <p className="results-note" role="status">
              {running ? t('aer.running') : current && 'error' in current ? failure(current.error) : ''}
            </p>
            {current && 'counts' in current && (
              <>
                <Histogram items={bars} vertical={current.measured.length > 4} />
                <p className="results-note">
                  {t('aer.counts', { shots: SHOTS })} {t('results.bitOrder', { order: order(current.measured) })}
                  {bars.length < Object.keys(current.counts).length && <> {t('aer.topOutcomes', { shown: bars.length, total: Object.keys(current.counts).length })}</>}
                </p>
              </>
            )}
          </>
        ) : (
          <p className="results-note">
            {t('aer.noLab', { count: circuit.qubits, max: BROWSER_QUBITS })}{' '}
            <a href={QUANTUM_LAB} target="_blank" rel="noreferrer">
              {t('aer.aboutLab')}
            </a>
          </p>
        )}
        <p className="results-note">{t('aer.limits', { max: BROWSER_QUBITS })}</p>
      </section>
      <div className="results-footer">
        <span className="status-dot" aria-hidden="true" />
        <span>{t(canRun ? 'aer.footer' : 'aer.footerNoLab', { max: BROWSER_QUBITS })}</span>
      </div>
    </aside>
  );
}
