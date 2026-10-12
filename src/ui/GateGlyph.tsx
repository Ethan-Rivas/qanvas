import type { ReactNode } from 'react';
import { formatAngle } from '../circuit/angle';
import { GATE_FAMILY, GATE_SYMBOL, type GateKind } from '../circuit/gates';

export type PartShape = 'box' | 'control' | 'oplus' | 'swap';

function MeasureIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size * 0.82} viewBox="0 0 22 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M3 14a8 8 0 0 1 16 0" />
      <path d="M11 14 16 6" />
    </svg>
  );
}

function CnotIcon() {
  return (
    <svg width="14" height="24" viewBox="0 0 20 30" aria-hidden="true">
      <circle cx="10" cy="5" r="4" fill="currentColor" />
      <path d="M10 9v12" stroke="currentColor" strokeWidth="2" />
      <circle cx="10" cy="22" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M10 15.5v13M3.5 22h13" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/** The gate's square symbol, as used in the palette and the drag preview. */
export function GateIcon({ kind, size = 'small' }: { kind: GateKind; size?: 'small' | 'large' }) {
  const family = GATE_FAMILY[kind];
  let content: ReactNode = GATE_SYMBOL[kind];
  if (kind === 'M') content = <MeasureIcon size={size === 'large' ? 22 : 18} />;
  if (kind === 'CNOT') content = <CnotIcon />;
  return (
    <span className={`gate-icon gate-icon--${size} family-${family}`} data-long={GATE_SYMBOL[kind].length > 2 || undefined}>
      {content}
    </span>
  );
}

/** One piece of a placed gate: its box, a control dot, a ⊕ target or a SWAP cross. */
export function PartGlyph({ kind, shape, angle }: { kind: GateKind; shape: PartShape; angle?: number }) {
  switch (shape) {
    case 'control':
      return <span className="part-control" />;
    case 'oplus':
      return (
        <span className="part-oplus">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" />
          </svg>
        </span>
      );
    case 'swap':
      return (
        <svg className="part-swap" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2 2l12 12M14 2 2 14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <span className={`part-box family-${GATE_FAMILY[kind]}`}>
          {kind === 'M' ? <MeasureIcon size={22} /> : <span className="part-symbol">{GATE_SYMBOL[kind]}</span>}
          {angle !== undefined && <span className="part-angle">{formatAngle(angle)}</span>}
        </span>
      );
  }
}
