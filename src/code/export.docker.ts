import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';
import type { Circuit } from '../circuit/model';
import { translator } from '../i18n/i18n';
import { densityOf } from '../sim/analysis';
import { finalState, probabilities } from '../sim/simulator';
import { countedQubits, measuresAtEnd, notebook, PYTHON_FORMATS, pythonScript, SHOTS } from './download';
import { CODE_FORMATS, codeText, generateCode } from './generate';
import { importQasm } from './qasmImport';

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

function runInLab(script: string, input: unknown): unknown {
  const work = mkdtempSync(join(tmpdir(), 'qanvas-export-'));
  writeFileSync(join(work, 'cases.json'), JSON.stringify(input));
  execFileSync('docker', [
    'run', '--rm', '--user', `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`, '-e', 'HOME=/tmp',
    '-v', `${ROOT}:/qanvas:ro`, '-v', `${work}:/work`, '-w', '/qanvas', IMAGE,
    'python', script, '/work/cases.json', '/work/results.json',
  ], { stdio: 'inherit' });
  return JSON.parse(readFileSync(join(work, 'results.json'), 'utf8'));
}

test(`exported code runs in Python and matches Qanvas on ${cases.length} circuits`, () => {
  const t = translator('en');
  const input = cases.map(({ name, circuit }) => ({
    name,
    qubits: circuit.qubits,
    code: Object.fromEntries(CODE_FORMATS.map((format) => [format, codeText(generateCode(format, circuit, t))])),
  }));
  const output = runInLab('scripts/run_exports.py', input) as { name: string; results: Record<string, Result>; qiskitQasm: string }[];
  const failures: string[] = [];
  output.forEach(({ name, results, qiskitQasm }, i) => {
    const expected = finalState(cases[i].circuit);
    const imported = importQasm(qiskitQasm);
    if (!imported.ok) failures.push(`${name} [import from Qiskit]: ${JSON.stringify(imported.error)}`);
    else {
      const state = finalState(imported.circuit);
      results['import from Qiskit'] = { re: Array.from(state.re), im: Array.from(state.im) };
    }
    for (const format of [...CODE_FORMATS, 'import from Qiskit']) {
      const result = results[format];
      if (!result) continue;
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

/** Probabilities of each outcome over the counted qubits, keyed with q0 first like the downloads. */
function outcomeProbabilities(circuit: Circuit): Map<string, number> {
  const p = probabilities(finalState(circuit));
  const counted = countedQubits(circuit);
  const result = new Map<string, number>();
  p.forEach((value, index) => {
    const key = counted.map((q) => (index >> (circuit.qubits - 1 - q)) & 1).join('');
    result.set(key, (result.get(key) ?? 0) + value);
  });
  return result;
}

function countFailures(label: string, counts: Record<string, number>, expected: Map<string, number>): string[] {
  const failures: string[] = [];
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total !== SHOTS) failures.push(`${label}: ${total} shots instead of ${SHOTS}`);
  for (const [key, p] of expected) {
    const frequency = (counts[key] ?? 0) / SHOTS;
    // Five standard deviations of a binomial count, plus a little room for outcomes near 0 or 1.
    if (Math.abs(frequency - p) > 5 * Math.sqrt((p * (1 - p)) / SHOTS) + 0.01) failures.push(`${label}: ${key} seen ${frequency}, expected ${p}`);
  }
  for (const key of Object.keys(counts)) if (!((expected.get(key) ?? 0) > 1e-9)) failures.push(`${label}: unexpected outcome ${key}`);
  return failures;
}

test('downloaded scripts and notebooks run and their counts agree with Qanvas', () => {
  const t = translator('en');
  const named = (name: string) => cases.find((c) => c.name === name)!;
  const scriptCases = [...cases.filter((c) => !c.name.startsWith('random') && !c.name.includes(' of ')), ...cases.filter((c) => c.name.startsWith('random')).slice(0, 12), named('H q0 of 1')];
  const notebookCases = new Set(['bell', 'teleportation', 'random 002 (3 qubits)', 'random 005 (6 qubits)', 'H q0 of 1']);
  const input = scriptCases.map(({ name, circuit }) => ({
    name,
    script: Object.fromEntries(PYTHON_FORMATS.map((format) => [format, pythonScript(format, circuit, t)])),
    ...(notebookCases.has(name) && { notebook: Object.fromEntries(PYTHON_FORMATS.map((format) => [format, notebook(format, circuit, t, name)])) }),
  }));
  const output = runInLab('scripts/run_downloads.py', input) as { name: string; results: Record<string, { counts: Record<string, number> } | { error: string }> }[];

  const failures: string[] = [];
  output.forEach(({ name, results }, i) => {
    const expected = outcomeProbabilities(scriptCases[i].circuit);
    const expectedRuns = 3 * (notebookCases.has(name) ? 2 : 1);
    if (Object.keys(results).length !== expectedRuns) failures.push(`${name}: ${Object.keys(results).length} runs instead of ${expectedRuns}`);
    for (const [run, result] of Object.entries(results)) {
      if ('error' in result) {
        failures.push(`${name} [${run}]: ${result.error}`);
        continue;
      }
      failures.push(...countFailures(`${name} [${run}]`, result.counts, expected));
    }
  });
  expect(failures).toEqual([]);
}, 1_200_000);

test('code for circuits that measure partway through runs and agrees with Qanvas', () => {
  const t = translator('en');
  const dynamic: Case[] = JSON.parse(readFileSync(join(ROOT, 'reference/data/mid-circuit.json'), 'utf8'));
  const picked = [...dynamic.filter((c) => !c.name.startsWith('random')), ...dynamic.filter((c) => c.name.startsWith('random')).slice(0, 12)];
  const input = picked.map(({ name, circuit }) => ({
    name,
    script: Object.fromEntries(PYTHON_FORMATS.map((format) => [format, pythonScript(format, circuit, t)])),
    qasm: codeText(generateCode('qasm', circuit, t)),
    qiskit: codeText(generateCode('qiskit', circuit, t)),
    counted: countedQubits(circuit),
    measuresAtEnd: measuresAtEnd(circuit),
    shots: SHOTS,
  }));
  const output = runInLab('scripts/run_dynamic.py', input) as { name: string; results: Record<string, { counts: Record<string, number> } | { error: string }>; qiskitQasm: string }[];

  const failures: string[] = [];
  output.forEach(({ name, results, qiskitQasm }, i) => {
    const { circuit } = picked[i];
    const expected = outcomeProbabilities(circuit);
    const expectedRuns = 3 + (measuresAtEnd(circuit) ? 1 : 0);
    if (Object.keys(results).length !== expectedRuns) failures.push(`${name}: ${Object.keys(results).length} runs instead of ${expectedRuns}`);
    for (const [run, result] of Object.entries(results)) {
      if ('error' in result) failures.push(`${name} [${run}]: ${result.error}`);
      else failures.push(...countFailures(`${name} [${run}]`, result.counts, expected));
    }
    const imported = importQasm(qiskitQasm);
    if (!imported.ok) {
      failures.push(`${name} [import from Qiskit]: ${JSON.stringify(imported.error)} ${qiskitQasm.slice(0, 200)}`);
      return;
    }
    const a = densityOf(finalState(imported.circuit));
    const b = densityOf(finalState(circuit));
    const worst = Math.max(...Array.from(a.re, (re, k) => Math.hypot(re - b.re[k], a.im[k] - b.im[k])));
    if (!(worst <= TOLERANCE)) failures.push(`${name} [import from Qiskit]: off by ${worst}`);
  });
  expect(failures).toEqual([]);
}, 1_200_000);
