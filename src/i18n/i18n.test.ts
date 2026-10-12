import { expect, it } from 'vitest';
import en from './en.json';
import es from './es.json';

it('has every message in both languages', () => {
  expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
});
