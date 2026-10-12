// Renders the app icons in public/icons from the design tokens. Run with `npm run icons`
// after changing the brand color, and commit the PNG files.
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { iconSvg, readTokens } from './brand.ts';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'public/icons');

const ICONS = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: true },
];

mkdirSync(OUT, { recursive: true });
const tokens = readTokens(ROOT);
const browser = await chromium.launch();
const page = await browser.newPage();
for (const { file, size, maskable } of ICONS) {
  await page.setViewportSize({ width: size, height: size });
  const svg = iconSvg(tokens, { maskable }).replace('<svg ', `<svg width="${size}" height="${size}" `);
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`);
  await page.screenshot({ path: join(OUT, file), omitBackground: true });
  console.log(`public/icons/${file}`);
}
await browser.close();
