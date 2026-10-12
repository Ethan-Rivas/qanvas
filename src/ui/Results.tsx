import { useEditor } from '../editor/store';
import { formatPercent } from '../i18n/i18n';
import { useT } from '../i18n/useT';
import { useSimulation } from '../sim/useSimulation';

const MAX_BARS = 16;
const SHOWN_PROBABILITY = 1e-12;

function ket(index: number, qubits: number) {
  return index.toString(2).padStart(qubits, '0');
}

function bitOrder(qubits: number) {
  if (qubits <= 4) return Array.from({ length: qubits }, (_, q) => `q${q}`).join(' ');
  return `q0 q1 … q${qubits - 1}`;
}

/** All outcomes when they fit; otherwise the most likely ones, still in basis order. */
function outcomesToShow(probabilities: Float64Array): number[] {
  const all = Array.from(probabilities.keys());
  if (all.length <= MAX_BARS) return all;
  return all
    .filter((i) => probabilities[i] > SHOWN_PROBABILITY)
    .sort((a, b) => probabilities[b] - probabilities[a])
    .slice(0, MAX_BARS)
    .sort((a, b) => a - b);
}

export function Results() {
  const t = useT();
  const language = useEditor((s) => s.language);
  const circuit = useEditor((s) => s.circuit);
  const { result, pending } = useSimulation(circuit);

  const shown = result ? outcomesToShow(result.probabilities) : [];
  const total = result ? result.probabilities.length : 0;
  const compact = shown.length > 8;

  return (
    <aside className="results" aria-label={t('results.title')}>
      <div className="results-section">
        <div className="results-heading">
          <h2>{t('results.title')}</h2>
          <span className="results-subtitle">{t('results.atEnd')}</span>
        </div>
        {result && (
          <>
            <ul className="histogram" data-compact={compact || undefined} data-vertical={result.qubits > 4 || undefined}>
              {shown.map((i) => {
                const p = result.probabilities[i];
                const percent = formatPercent(language, p);
                const label = ket(i, result.qubits);
                const likely = p > 0.005;
                return (
                  <li key={i} className="histogram-item">
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
            <p className="results-note">
              {t('results.bitOrder', { order: bitOrder(result.qubits) })}
              {shown.length < total && <> {t('results.topOutcomes', { shown: shown.length, total: total.toLocaleString(language) })}</>}
            </p>
          </>
        )}
      </div>
      <div className="results-footer">
        <span className="status-dot" aria-hidden="true" />
        <span>{t(pending ? 'results.simulating' : 'results.simulatedLocally')}</span>
      </div>
    </aside>
  );
}
