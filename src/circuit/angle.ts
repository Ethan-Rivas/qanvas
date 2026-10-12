const PI_DENOMINATORS = [1, 2, 3, 4, 6, 8, 12];
const EPSILON = 1e-9;

/** Shows an angle as a fraction of π when it is one (π/2, -3π/4), otherwise with two decimals. */
export function formatAngle(angle: number): string {
  if (Math.abs(angle) < EPSILON) return '0';
  for (const d of PI_DENOMINATORS) {
    const n = Math.round((angle / Math.PI) * d);
    if (n !== 0 && Math.abs(angle - (n * Math.PI) / d) < EPSILON) {
      const sign = n < 0 ? '-' : '';
      const numerator = Math.abs(n) === 1 ? 'π' : `${Math.abs(n)}π`;
      return d === 1 ? `${sign}${numerator}` : `${sign}${numerator}/${d}`;
    }
  }
  return angle.toFixed(2);
}

const ANGLE_PATTERN = /^([+-])?(\d*\.?\d*)?\s*\*?\s*(π|pi)?\s*(?:\/\s*(\d*\.?\d+))?$/i;

/** Reads what a student types: "pi/2", "π/4", "-3pi/4", "2π", "1.57". Returns null for anything else. */
export function parseAngle(text: string): number | null {
  const match = ANGLE_PATTERN.exec(text.trim());
  if (!match) return null;
  const [, sign, number, pi, denominator] = match;
  if (!number && !pi) return null;
  const value = (number ? Number(number) : 1) * (pi ? Math.PI : 1) / (denominator ? Number(denominator) : 1);
  if (!Number.isFinite(value)) return null;
  return sign === '-' ? -value : value;
}
