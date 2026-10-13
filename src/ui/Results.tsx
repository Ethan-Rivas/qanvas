import { BROWSER_QUBITS, DENSITY_QUBITS, hasGateNoise, hasNoise, usesDensity } from '../circuit/model';
import { currentStep, useEditor } from '../editor/store';
import { formatPercent } from '../i18n/i18n';
import { useT } from '../i18n/useT';
import { blochVector, formatComplex, pureVector } from '../sim/analysis';
import { probabilities, withReadout } from '../sim/simulator';
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

/** Bars for each outcome; `p` is a probability or a measured fraction, and `ideal`, when given, the same outcome without noise. */
export function Histogram({ items, vertical }: { items: { label: string; p: number; ideal?: number }[]; vertical: boolean }) {
  const t = useT();
  const language = useEditor((s) => s.language);
  const compact = items.length > 8;
  const compared = items.some((item) => item.ideal !== undefined);
  return (
    <>
      <ul className="histogram" data-compact={compact || undefined} data-vertical={vertical || undefined}>
        {items.map(({ label, p, ideal }) => {
          const ket = `|${label}⟩`;
          const percent = formatPercent(language, p);
          const likely = p > 0.005 || (ideal ?? 0) > 0.005;
          return (
            <li key={label} className="histogram-item">
              <span className="visually-hidden">
                {ideal === undefined
                  ? t('results.outcome', { ket, percent })
                  : t('results.outcomeCompared', { ket, percent, ideal: formatPercent(language, ideal) })}
              </span>
              <span className="histogram-plot" aria-hidden="true">
                {!compact && likely && <span className="histogram-value">{percent}</span>}
                <span className="histogram-bars">
                  {ideal !== undefined && (
                    <span className="histogram-bar histogram-bar--ideal" style={{ height: `${ideal * 100}%` }} title={`${ket} ${formatPercent(language, ideal)}`} />
                  )}
                  <span className="histogram-bar" style={{ height: `${p * 100}%` }} title={`${ket} ${percent}`} />
                </span>
              </span>
              <span className="histogram-label" data-likely={likely || undefined} aria-hidden="true">
                {label}
              </span>
            </li>
          );
        })}
      </ul>
      {compared && (
        <p className="histogram-legend" aria-hidden="true">
          <span className="legend-item">
            <span className="legend-swatch" />
            {t('results.withNoise')}
          </span>
          <span className="legend-item">
            <span className="legend-swatch legend-swatch--ideal" />
            {t('results.withoutNoise')}
          </span>
        </p>
      )}
    </>
  );
}

export function Results({ result, ideal, pending }: { result: SimulationResult | null; ideal: SimulationResult | null; pending: boolean }) {
  const t = useT();
  const large = useEditor((s) => s.circuit.qubits > BROWSER_QUBITS);
  const densityLimited = useEditor((s) => usesDensity(s.circuit) && s.circuit.qubits > DENSITY_QUBITS);
  const circuit = useEditor((s) => s.circuit);
  const language = useEditor((s) => s.language);
  const learnMode = useEditor((s) => s.learnMode);
  const step = useEditor(currentStep);
  const end = useEditor((s) => s.circuit.columns.length);

  const state = result && stateAt(result, step);
  const vector = state && pureVector(state);
  const qubits = state?.qubits ?? 0;
  const exact = state ? probabilities(state) : new Float64Array();
  const readout = circuit.noise?.readout ?? 0;
  const p = withReadout(exact, qubits, readout);
  const idealState = hasGateNoise(circuit) ? ideal && stateAt(ideal, step) : state;
  const idealP = hasNoise(circuit) && idealState && idealState.qubits === qubits ? probabilities(idealState) : null;
  const all = Array.from(p.keys());
  const bars = p.length <= MAX_ROWS ? all : mostLikely(p, all.filter((i) => p[i] > SHOWN_PROBABILITY));
  const nonzero = all.filter((i) => exact[i] > SHOWN_PROBABILITY);
  const rows = mostLikely(exact, nonzero);
  const subtitle = step === 0 ? t('results.atStart') : step >= end ? t('results.atEnd') : t('results.afterStep', { step });

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
  if (large) return <AerResults />;

  return (
    <aside className="results" aria-label={t('results.title')}>
      <section className="results-section" aria-labelledby="results-title">
        <div className="results-heading">
          <h2 id="results-title">{t('results.title')}</h2>
          <span className="results-subtitle">{subtitle}</span>
        </div>
        {state && (
          <>
            <Histogram items={bars.map((i) => ({ label: ket(i, qubits), p: p[i], ...(idealP && { ideal: idealP[i] }) }))} vertical={qubits > 4} />
            <p className="results-note">
              {t('results.bitOrder', { order: bitOrder(qubits) })}
              {bars.length < p.length && <> {t('results.topOutcomes', { shown: bars.length, total: p.length.toLocaleString(language) })}</>}
              {readout > 0 && <> {t('results.readout', { percent: formatPercent(language, readout) })}</>}
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
                        <td>{formatPercent(language, exact[i])}</td>
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
