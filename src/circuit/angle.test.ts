import { expect, it } from 'vitest';
import { formatAngle, parseAngle } from './angle';

it('formats and parses angles as fractions of π', () => {
  expect([Math.PI / 2, (-3 * Math.PI) / 4, 2 * Math.PI, 0, 1.234].map(formatAngle)).toEqual(['π/2', '-3π/4', '2π', '0', '1.23']);
  expect(['pi/2', '-3π/4', '2pi', '1.5', ' π '].map(parseAngle)).toEqual([Math.PI / 2, (-3 * Math.PI) / 4, 2 * Math.PI, 1.5, Math.PI]);
  expect(['', 'abc', '.', 'pi/0'].map(parseAngle)).toEqual([null, null, null, null]);
});
