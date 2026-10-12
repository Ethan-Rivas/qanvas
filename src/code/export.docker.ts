import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';
import type { Circuit } from '../circuit/model';
import { translator } from '../i18n/i18n';
import { finalState } from '../sim/simulator';
import { CODE_FORMATS, codeText, generateCode } from './generate';

const TOLERANCE = 1e-9;
const ROOT = resolve(__dirname, '../..');
const IMAGE = process.env.QUANTUM_LAB_IMAGE ?? 'ghcr.io/ethan-rivas/quantum-lab:latest';

interface Case {
  name: string;
  circuit: Circuit;
}

type Result = { re: number[]; im: number[] } | { error: string };

const cases: Case[] = ['single-gate', 'examples', 'random'].flatMap((file) =>
  JSON.parse(readFileSync(join(ROOT, 'reference/data', `${file}.json`), 'utf8')),
);

test(`exported code runs in Python and matches Qanvas on ${cases.length} circuits`, () => {
  const t = translator('en');
  const work = mkdtempSync(join(tmpdir(), 'qanvas-export-'));
  const input = cases.map(({ name, circuit }) => ({
    name,
    qubits: circuit.qubits,
    code: Object.fromEntries(CODE_FORMATS.map((format) => [format, codeText(generateCode(format, circuit, t))])),
  }));
  writeFileSync(join(work, 'cases.json'), JSON.stringify(input));

  execFileSync('docker', [
    'run', '--rm', '--user', `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`, '-e', 'HOME=/tmp',
    '-v', `${ROOT}:/qanvas:ro`, '-v', `${work}:/work`, '-w', '/qanvas', IMAGE,
    'python', 'scripts/run_exports.py', '/work/cases.json', '/work/results.json',
  ], { stdio: 'inherit' });

  const output: { name: string; results: Record<string, Result> }[] = JSON.parse(readFileSync(join(work, 'results.json'), 'utf8'));
  const failures: string[] = [];
  output.forEach(({ name, results }, i) => {
    const expected = finalState(cases[i].circuit);
    for (const format of CODE_FORMATS) {
      const result = results[format];
      if ('error' in result) {
        failures.push(`${name} [${format}]: ${result.error}`);
        continue;
      }
      if (result.re.length !== expected.re.length) {
        failures.push(`${name} [${format}]: ${result.re.length} amplitudes instead of ${expected.re.length}`);
        continue;
      }
      const worst = Math.max(...result.re.map((re, k) => Math.hypot(re - expected.re[k], result.im[k] - expected.im[k])));
      if (!(worst <= TOLERANCE)) failures.push(`${name} [${format}]: off by ${worst}`);
    }
  });
  expect(failures).toEqual([]);
}, 600_000);
