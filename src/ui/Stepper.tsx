import type { CSSProperties } from 'react';
import { currentStep, useEditor } from '../editor/store';
import { useT } from '../i18n/useT';
import { columnLabel, explainStep } from '../learn/explain';
import { stateAt, type SimulationResult } from '../sim/useSimulation';

const MAX_LABELS = 6;

function Arrow({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d={direction === 'left' ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />
    </svg>
  );
}

export function Stepper() {
  const t = useT();
  const language = useEditor((s) => s.language);
  const columns = useEditor((s) => s.circuit.columns);
  const step = useEditor(currentStep);
  const setStep = useEditor((s) => s.setStep);
  const end = columns.length;
  const labels = [t('step.start'), ...columns.map((column) => columnLabel(column, t, language))];
  const valueText = step === 0 ? t('step.valueStart') : t('step.valueText', { step, total: end, label: labels[step] });

  return (
    <div className="stepper">
      <button type="button" className="step-button" aria-label={t('step.previous')} disabled={step === 0} onClick={() => setStep(step - 1)}>
        <Arrow direction="left" />
      </button>
      <div className="stepper-track">
        <input
          type="range"
          className="step-slider"
          min={0}
          max={end}
          step={1}
          value={step}
          aria-label={t('step.slider')}
          aria-valuetext={valueText}
          onChange={(e) => setStep(Number(e.target.value))}
          style={{ '--progress': `${(step / end) * 100}%` } as CSSProperties}
        />
        {end < MAX_LABELS && (
          <div className="step-labels" aria-hidden="true">
            {labels.map((label, k) => (
              <span key={k} data-current={k === step || undefined} style={{ '--at': k / end } as CSSProperties}>
                {label}
              </span>
            ))}
          </div>
        )}
        <div className="step-position" data-fallback={end < MAX_LABELS || undefined} aria-hidden="true">
          {step === 0 ? labels[0] : `${t('step.position', { step, total: end })} · ${labels[step]}`}
        </div>
      </div>
      <button
        type="button"
        className="step-button step-button--primary"
        aria-label={t('step.next')}
        disabled={step === end}
        onClick={() => setStep(step + 1)}
      >
        <Arrow direction="right" />
      </button>
    </div>
  );
}

export function StepCallout({ result, step }: { result: SimulationResult; step: number }) {
  const t = useT();
  const language = useEditor((s) => s.language);
  // While a new result is on its way, the old one may not have this step yet.
  if (step > result.circuit.columns.length) return null;
  const explanation = explainStep(result.circuit, step, stateAt(result, step - 1), stateAt(result, step), t, language);

  return (
    <section className="callout" aria-labelledby="callout-title">
      <span className="callout-pointer" aria-hidden="true" />
      <div className="callout-heading">
        <span className="callout-step">{t('learn.step', { step, label: explanation.label })}</span>
        <h3 id="callout-title" className="callout-title">
          {explanation.title}
        </h3>
      </div>
      <p className="callout-text">{explanation.sentences.join(' ')}</p>
      <div className="callout-states">
        <span>
          <span className="callout-before">{t('learn.before')}</span> {explanation.before}
        </span>
        <span>
          <span className="callout-after">{t('learn.after')}</span> {explanation.after}
        </span>
      </div>
    </section>
  );
}
