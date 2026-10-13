import { BROWSER_QUBITS, DENSITY_QUBITS, isDynamic } from '../circuit/model';
import { currentStep, useEditor } from '../editor/store';
import { formatPercent } from '../i18n/i18n';
import { useT } from '../i18n/useT';
import { blochVector, formatComplex, pureVector } from '../sim/analysis';
import { probabilities } from '../sim/simulator';
import { stateAt, type SimulationResult } from '../sim/useSimulation';
import { AerResults } from './AerResults';
import { BlochSphere } from './Bloch';

const MAX_ROWS = 16;
const SHOWN_PROBABILITY = 1e-12;

function ket(index: number, qubits: number) {
  return index.toString(2).padStart(qubits, '0');
}

export function bitOrder(qubits: number) {
  if (qubits <= 4) return Array.from({ length: qubits }, (_, q) => `q${q}`).join(' ');
  return `q0 q1 … q${qubits - 1}`;
}

/** All outcomes when they fit; otherwise the most likely ones, still in basis order. */
function mostLikely(p: Float64Array, candidates: number[]): number[] {
  if (candidates.length <= MAX_ROWS) return candidates;
  return [...candidates]
    .sort((a, b) => p[b] - p[a])
    .slice(0, MAX_ROWS)
    .sort((a, b) => a - b);
}

/** Bars for each outcome; `p` is a probability or a measured fraction. */
export function Histogram({ items, vertical }: { items: { label: string; p: number }[]; vertical: boolean }) {
  const t = useT();
  const language = useEditor((s) => s.language);
  const compact = items.length > 8;
  return (
    <ul className="histogram" data-compact={compact || undefined} data-vertical={vertical || undefined}>
      {items.map(({ label, p }) => {
        const percent = formatPercent(language, p);
        const likely = p > 0.005;
        return (
          <li key={label} className="histogram-item">
            <span className="visually-hidden">{t('results.outcome', { ket: `|${label}⟩`, percent })}</span>
            <span className="histogram-plot" aria-hidden="true">
              {!compact && likely && <span className="histogram-value">{percent}</span>}
              <span className="histogram-bar" style={{ height: `${p * 100}%` }} title={`|${label}⟩ ${percent}`} />
            </span>
            <span className="histogram-label" data-likely={likely || undefined} aria-hidden="true">
              {label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function Results({ result, pending }: { result: SimulationResult | null; pending: boolean }) {
  const t = useT();
  const large = useEditor((s) => s.circuit.qubits > BROWSER_QUBITS);
  const densityLimited = useEditor((s) => !large && isDynamic(s.circuit) && s.circuit.qubits > DENSITY_QUBITS);
  const language = useEditor((s) => s.language);
  const learnMode = useEditor((s) => s.learnMode);
  const step = useEditor(currentStep);
  const end = useEditor((s) => s.circuit.columns.length);

  const state = result && stateAt(result, step);
  const vector = state && pureVector(state);
  const p = state ? probabilities(state) : new Float64Array();
  const qubits = state?.qubits ?? 0;
  const all = Array.from(p.keys());
  const bars = p.length <= MAX_ROWS ? all : mostLikely(p, all.filter((i) => p[i] > SHOWN_PROBABILITY));
  const nonzero = all.filter((i) => p[i] > SHOWN_PROBABILITY);
  const rows = mostLikely(p, nonzero);
  const subtitle = step === 0 ? t('results.atStart') : step >= end ? t('results.atEnd') : t('results.afterStep', { step });

  if (large) return <AerResults />;
  if (densityLimited) {
    return (
      <aside className="results" aria-label={t('results.title')}>
        <section className="results-section">
          <h2>{t('results.title')}</h2>
          <p className="results-note">{t('results.densityLimit', { max: DENSITY_QUBITS })}</p>
        </section>
      </aside>
    );
  }

  return (
    <aside className="results" aria-label={t('results.title')}>
      <section className="results-section" aria-labelledby="results-title">
        <div className="results-heading">
          <h2 id="results-title">{t('results.title')}</h2>
          <span className="results-subtitle">{subtitle}</span>
        </div>
        {state && (
          <>
            <Histogram items={bars.map((i) => ({ label: ket(i, qubits), p: p[i] }))} vertical={qubits > 4} />
            <p className="results-note">
              {t('results.bitOrder', { order: bitOrder(qubits) })}
              {bars.length < p.length && <> {t('results.topOutcomes', { shown: bars.length, total: p.length.toLocaleString(language) })}</>}
            </p>

            {vector ? (
              <details className="amplitudes">
                <summary>{t('results.amplitudes')}</summary>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{t('results.state')}</th>
                      <th scope="col">{t('results.amplitude')}</th>
                      <th scope="col">{t('results.probability')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((i) => (
                      <tr key={i}>
                        <th scope="row">|{ket(i, qubits)}⟩</th>
                        <td>{formatComplex(vector.re[i], vector.im[i])}</td>
                        <td>{formatPercent(language, p[i])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length < nonzero.length && (
                  <p className="results-note">{t('results.topAmplitudes', { shown: rows.length, total: nonzero.length.toLocaleString(language) })}</p>
                )}
              </details>
            ) : (
              <p className="results-note">{t('results.noAmplitudes')}</p>
            )}
          </>
        )}
      </section>

      {state && (
        <section className="results-section results-bloch" aria-labelledby="bloch-title">
          <h2 id="bloch-title">{t('bloch.title')}</h2>
          {learnMode && <p className="results-note">{t(vector ? 'bloch.hint' : 'bloch.hintMixed')}</p>}
          <ul className="bloch-grid">
            {Array.from({ length: qubits }, (_, q) => (
              <BlochSphere key={q} qubit={q} bloch={blochVector(state, q)} mixed={!vector} t={t} />
            ))}
          </ul>
        </section>
      )}

      <div className="results-footer">
        <span className="status-dot" aria-hidden="true" />
        <span>{t(pending ? 'results.simulating' : 'results.simulatedLocally')}</span>
      </div>
    </aside>
  );
}
