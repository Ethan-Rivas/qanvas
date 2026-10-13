import { hasNoise, isDynamic, operationQubits, type Circuit } from '../circuit/model';
import type { Translate } from '../i18n/i18n';
import { measurementCounts, measurementKey, measures, operations } from './common';
import { cirqMeasure } from './cirq';
import { generateCode } from './generate';

export type PythonFormat = 'qiskit' | 'cirq' | 'pyquil';
export const PYTHON_FORMATS: PythonFormat[] = ['qiskit', 'cirq', 'pyquil'];
export const SHOTS = 1000;

function lastGates(circuit: Circuit): Map<number, string> {
  const last = new Map<number, string>();
  for (const { op } of operations(circuit)) for (const q of operationQubits(op)) last.set(q, op.gate);
  return last;
}

/** The qubits whose outcomes are counted: the ones that end with a measurement, or all of them when none does. */
export function countedQubits(circuit: Circuit): number[] {
  const last = lastGates(circuit);
  const all = Array.from({ length: circuit.qubits }, (_, q) => q);
  const measured = all.filter((q) => last.get(q) === 'M');
  return measured.length > 0 ? measured : all;
}

export function measuresAtEnd(circuit: Circuit): boolean {
  return [...lastGates(circuit).values()].includes('M');
}

const python = (text: string) => JSON.stringify(text);

/** Code that runs the circuit SHOTS times and leaves `counts`, keyed by outcomes with q0 first. */
function runCode(format: PythonFormat, circuit: Circuit, t: Translate): { imports: string[]; body: string[] } {
  const atEnd = measuresAtEnd(circuit);
  const measured = countedQubits(circuit);
  const counted = `measured = [${measured.join(', ')}]`;
  const measureAll = atEnd ? [] : [`# ${t('download.measureAll')}`];
  const tally = ['counts = {}', 'for key in keys:', '    counts[key] = counts.get(key, 0) + 1'];
  switch (format) {
    case 'qiskit': {
      const noisy = hasNoise(circuit);
      const sampler = noisy
        ? { imports: ['from qiskit_aer.primitives import SamplerV2'], note: [`# ${t('download.qiskitAerNoise')}`], run: 'SamplerV2(options={"backend_options": {"noise_model": noise}})' }
        : isDynamic(circuit)
          ? { imports: ['from qiskit_aer.primitives import SamplerV2'], note: [`# ${t('download.qiskitAer')}`], run: 'SamplerV2()' }
          : { imports: ['from qiskit.primitives import StatevectorSampler'], note: [], run: 'StatevectorSampler()' };
      return {
        imports: sampler.imports,
        body: [
          counted,
          ...measureAll,
          ...(atEnd ? [] : [measures(circuit) ? `qc.measure(range(${circuit.qubits}), range(${circuit.qubits}))` : 'qc.measure_all()']),
          ...sampler.note,
          `result = ${sampler.run}.run([qc], shots=${SHOTS}).result()[0]`,
          `# ${t('download.qiskitReverse')}`,
          'counts = {}',
          'for bits, n in result.join_data().get_counts().items():',
          '    key = "".join(bits[::-1][q] for q in measured)',
          '    counts[key] = counts.get(key, 0) + n',
        ],
      };
    }
    case 'cirq': {
      const counts = measurementCounts(circuit);
      const keys = measured.map((q) => measurementKey(q, atEnd ? counts[q] : counts[q] + 1));
      const finalMeasurements = measured.map((q, k) => cirqMeasure(q, keys[k], circuit.noise?.readout ?? 0)).join(', ');
      return {
        imports: [],
        body: [
          counted,
          ...measureAll,
          ...(atEnd ? [] : [`circuit.append(cirq.Moment(${finalMeasurements}))`]),
          `keys = [${keys.map((key) => `"${key}"`).join(', ')}]`,
          `result = cirq.Simulator().run(circuit, repetitions=${SHOTS})`,
          'histogram = result.multi_measurement_histogram(keys=keys)',
          'counts = {"".join(map(str, bits)): n for bits, n in histogram.items()}',
        ],
      };
    }
    case 'pyquil':
      return {
        imports: ['import warnings', 'from pyquil import get_qc', ...(measures(circuit) ? [] : ['from pyquil.gates import MEASURE'])],
        body: [
          counted,
          ...measureAll,
          ...(atEnd ? [] : [...(measures(circuit) ? [] : [`ro = program.declare("ro", "BIT", ${circuit.qubits})`]), 'program += [MEASURE(q, ro[q]) for q in measured]']),
          `# ${t('download.pyquil5')}`,
          'warnings.filterwarnings("ignore", message=".*pyQuil v5")',
          `# ${t('download.pyqvm', { qubits: circuit.qubits })}`,
          `qc = get_qc("${circuit.qubits}q-pyqvm")`,
          `program.wrap_in_numshots_loop(${SHOTS})`,
          'readout = qc.run(program).get_register_map()["ro"]',
          'keys = ["".join(str(shot[q]) for q in measured) for shot in readout]',
          ...tally,
        ],
      };
  }
}

function runCell(format: PythonFormat, circuit: Circuit, t: Translate): string[] {
  const { imports, body } = runCode(format, circuit, t);
  return [...imports, ...(imports.length > 0 ? [''] : []), ...body, 'counts'];
}

function plotCode(t: Translate): string[] {
  return [
    'import matplotlib.pyplot as plt',
    '',
    'outcomes = sorted(counts)',
    'plt.bar(outcomes, [counts[key] for key in outcomes])',
    `plt.xlabel(${python(t('download.outcome'))})`,
    `plt.ylabel(${python(t('download.count'))})`,
    'plt.show()',
  ];
}

const isStandardLibrary = (line: string) => /^(import warnings|from math )/.test(line);

/** The circuit code with the run code after it; the run code's imports join the ones at the top. */
export function pythonScript(format: PythonFormat, circuit: Circuit, t: Translate): string {
  const code = generateCode(format, circuit, t).map((line) => line.text);
  const { imports, body } = runCode(format, circuit, t);
  const end = code.indexOf('');
  const standardLibraryFirst = [...code.slice(0, end), ...imports].sort((a, b) => Number(isStandardLibrary(b)) - Number(isStandardLibrary(a)));
  return [...standardLibraryFirst, ...code.slice(end), '', ...body, 'print(counts)', ''].join('\n');
}

function cell(kind: 'markdown' | 'code', id: number, lines: string[]) {
  const source = lines.map((line, k) => (k < lines.length - 1 ? `${line}\n` : line));
  return kind === 'markdown' ? { cell_type: kind, id: `cell-${id}`, metadata: {}, source } : { cell_type: kind, id: `cell-${id}`, metadata: {}, execution_count: null, outputs: [], source };
}

export function notebook(format: PythonFormat, circuit: Circuit, t: Translate, title: string): string {
  const circuitCode = generateCode(format, circuit, t).map((line) => line.text);
  const cells = [
    cell('markdown', 1, [`# ${title}`, '', t('download.notebookIntro', { framework: t(`code.format.${format}`) })]),
    cell('code', 2, circuitCode),
    cell('markdown', 3, [t('download.runIntro', { shots: SHOTS })]),
    cell('code', 4, runCell(format, circuit, t)),
    cell('code', 5, plotCode(t)),
  ];
  const metadata = {
    kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' },
    language_info: { name: 'python' },
  };
  return `${JSON.stringify({ cells, metadata, nbformat: 4, nbformat_minor: 5 }, null, 1)}\n`;
}
