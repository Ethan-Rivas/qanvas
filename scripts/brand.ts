import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Reads `--name: value;` pairs from the design tokens, so build files never repeat a color. */
export function readTokens(root: string): Record<string, string> {
  const css = readFileSync(join(root, 'src/styles/tokens.css'), 'utf8');
  return Object.fromEntries([...css.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));
}

export function readMessages(root: string, language: 'en' | 'es'): Record<string, string> {
  return JSON.parse(readFileSync(join(root, `src/i18n/${language}.json`), 'utf8'));
}

/**
 * The Qanvas mark from concept D. The maskable version fills the whole square, with the glyph
 * inside the central safe zone that launchers never crop.
 */
export function iconSvg(tokens: Record<string, string>, { maskable = false } = {}): string {
  const glyph = `<circle cx="13" cy="13" r="5.5" fill="none" stroke="${tokens['on-brand']}" stroke-width="2"/><path d="M16.5 16.5 L20 20" stroke="${tokens['on-brand']}" stroke-width="2" stroke-linecap="round"/>`;
  const body = maskable
    ? `<rect width="26" height="26" fill="${tokens.brand}"/><g transform="translate(3.25 3.25) scale(0.75)">${glyph}</g>`
    : `<rect x="1" y="1" width="24" height="24" rx="7" fill="${tokens.brand}"/>${glyph}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 26">${body}</svg>`;
}
