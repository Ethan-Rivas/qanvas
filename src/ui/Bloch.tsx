import type { Translate } from '../i18n/i18n';
import { blochLength, isEntangled, type Bloch } from '../sim/analysis';

const SIZE = 76;
const C = SIZE / 2;
const R = 32;
// The view looks slightly down on the sphere, turned so the X axis points toward the lower left.
const TILT = 0.28;
const TURN = Math.PI / 6;

function project({ x, y, z }: Bloch): [number, number] {
  const across = y * Math.cos(TURN) - x * Math.sin(TURN);
  const toward = y * Math.sin(TURN) + x * Math.cos(TURN);
  return [C + R * across, C - R * Math.sqrt(1 - TILT ** 2) * z + R * TILT * toward];
}

const AXIS_STATES: [keyof Bloch, number, string][] = [
  ['z', 1, '|0⟩'],
  ['z', -1, '|1⟩'],
  ['x', 1, '|+⟩'],
  ['x', -1, '|−⟩'],
  ['y', 1, '|+i⟩'],
  ['y', -1, '|−i⟩'],
];

function status(bloch: Bloch, t: Translate): string {
  if (isEntangled(bloch)) return t('bloch.entangled');
  const axis = AXIS_STATES.find(([key, sign]) => Math.abs(bloch[key] - sign) < 1e-6);
  return axis ? axis[2] : t('bloch.notEntangled');
}

const fixed = (v: number) => (Math.abs(v) < 0.005 ? 0 : v).toFixed(2);

export function BlochSphere({ qubit, bloch, t }: { qubit: number; bloch: Bloch; t: Translate }) {
  const [tipX, tipY] = project(bloch);
  const length = blochLength(bloch);
  const text = status(bloch, t);
  const description = t('bloch.description', {
    qubit: `q${qubit}`,
    status: text,
    x: fixed(bloch.x),
    y: fixed(bloch.y),
    z: fixed(bloch.z),
    length: fixed(length),
  });

  return (
    <li className="bloch">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={description}>
        <circle cx={C} cy={C} r={R} className="bloch-sphere" strokeWidth="1.5" />
        <ellipse cx={C} cy={C} rx={R} ry={R * TILT} className="bloch-guide" strokeWidth="1" strokeDasharray="3 3" />
        <path d={`M${C} ${C - R}v${2 * R}`} className="bloch-guide" strokeWidth="1" strokeDasharray="3 3" />
        {length > 0.05 ? (
          <>
            <path d={`M${C} ${C}L${tipX} ${tipY}`} className="bloch-arrow" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx={tipX} cy={tipY} r="4" className="bloch-tip" />
          </>
        ) : (
          <circle cx={C} cy={C} r="4.5" className="bloch-tip" />
        )}
      </svg>
      <span className="bloch-qubit" aria-hidden="true">
        q{qubit}
      </span>
      <span className="bloch-status" aria-hidden="true">
        {text}
      </span>
    </li>
  );
}
