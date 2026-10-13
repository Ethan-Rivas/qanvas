import { hasNoise, NOISE_LIMITS, type Noise } from '../circuit/model';
import { useEditor } from '../editor/store';
import { formatPercent } from '../i18n/i18n';
import { useT } from '../i18n/useT';

const RATES = ['oneQubit', 'twoQubit', 'readout'] as const;
const OFF: Noise = { oneQubit: 0, twoQubit: 0, readout: 0 };

export function NoisePanel() {
  const t = useT();
  const language = useEditor((s) => s.language);
  const circuit = useEditor((s) => s.circuit);
  const setNoise = useEditor((s) => s.setNoise);
  const noise = circuit.noise ?? OFF;
  // In whole tenths of a percent, so 0.099 shows as 9.9 and not 9.900000000000002.
  const percent = (rate: keyof Noise) => Math.round(noise[rate] * 1000) / 10;

  return (
    <section id="noise-panel" className="noise-panel" aria-labelledby="noise-title">
      <h2 id="noise-title" className="noise-title">
        {t('noise.title')}
      </h2>
      <p className="noise-intro">{t('noise.intro')}</p>
      {RATES.map((rate) => (
        <div key={rate} className="noise-rate">
          <label htmlFor={`noise-${rate}`}>{t(`noise.${rate}`)}</label>
          <input
            id={`noise-${rate}`}
            type="range"
            min={0}
            max={Math.round(NOISE_LIMITS[rate] * 100)}
            step={0.1}
            value={percent(rate)}
            aria-describedby={`noise-${rate}-help`}
            aria-valuetext={formatPercent(language, noise[rate])}
            onChange={(event) => setNoise({ ...noise, [rate]: Number(event.target.value) / 100 })}
          />
          <output htmlFor={`noise-${rate}`}>{formatPercent(language, noise[rate])}</output>
          <span id={`noise-${rate}-help`} className="field-help">
            {t(`noise.${rate}Help`)}
          </span>
        </div>
      ))}
      <button type="button" className="button" disabled={!hasNoise(circuit)} onClick={() => setNoise(null)}>
        {t('noise.off')}
      </button>
    </section>
  );
}
