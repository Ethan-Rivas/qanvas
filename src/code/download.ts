import type { Circuit } from '../circuit/model';
import type { Translate } from '../i18n/i18n';
import { measures, operations } from './common';
import { codeText, generateCode } from './generate';

export type PythonFormat = 'qiskit' | 'cirq' | 'pyquil';
export const PYTHON_FORMATS: PythonFormat[] = ['qiskit', 'cirq', 'pyquil'];
export const SHOTS = 1000;

/** The qubits whose outcomes are counted: the measured ones, or all of them when nothing is measured. */
export function countedQubits(circuit: Circuit): number[] {
  const measured = new Set(operations(circuit).flatMap(({ op }) => (op.gate === 'M' ? op.targets : [])));
  const all = Array.from({ length: circuit.qubits }, (_, q) => q);
  return measured.size > 0 ? all.filter((q) => measured.has(q)) : all;
}

const python = (text: string) => JSON.stringify(text);

/** Code that runs the circuit SHOTS times and leaves `counts`, keyed by outcomes with q0 first. */
function runCode(format: PythonFormat, circuit: Circuit, t: Translate): string[] {
  const counted = `measured = [${countedQubits(circuit).join(', ')}]`;
  const measureAll = measures(circuit) ? [] : [`# ${t('download.measureAll')}`];
  const tally = ['counts = {}', 'for key in keys:', '    counts[key] = counts.get(key, 0) + 1'];
  switch (format) {
    case 'qiskit':
      return [
        'from qiskit.primitives import StatevectorSampler',
        '',
        counted,
        ...measureAll,
        ...(measures(circuit) ? [] : ['qc.measure_all()']),
        `result = StatevectorSampler().run([qc], shots=${SHOTS}).result()[0]`,
        `# ${t('download.qiskitReverse')}`,
        'counts = {}',
        'for bits, n in result.join_data().get_counts().items():',
        '    key = "".join(bits[::-1][q] for q in measured)',
        '    counts[key] = counts.get(key, 0) + n',
      ];
    case 'cirq':
      return [
        counted,
        ...measureAll,
        ...(measures(circuit) ? [] : ['circuit.append(cirq.measure(q[i], key=f"q{i}") for i in measured)']),
        `result = cirq.Simulator().run(circuit, repetitions=${SHOTS})`,
        'histogram = result.multi_measurement_histogram(keys=[f"q{i}" for i in measured])',
        'counts = {"".join(map(str, bits)): n for bits, n in histogram.items()}',
      ];
    case 'pyquil':
      return [
        'from pyquil import get_qc',
        ...(measures(circuit) ? [] : ['from pyquil.gates import MEASURE']),
        '',
        counted,
        ...measureAll,
        ...(measures(circuit) ? [] : [`ro = program.declare("ro", "BIT", ${circuit.qubits})`, 'program += [MEASURE(q, ro[q]) for q in measured]']),
        `# ${t('download.pyqvm', { qubits: circuit.qubits })}`,
        `qc = get_qc("${circuit.qubits}q-pyqvm")`,
        `program.wrap_in_numshots_loop(${SHOTS})`,
        'readout = qc.run(program).get_register_map()["ro"]',
        'keys = ["".join(str(shot[q]) for q in measured) for shot in readout]',
        ...tally,
      ];
  }
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

export function pythonScript(format: PythonFormat, circuit: Circuit, t: Translate): string {
  return `${codeText(generateCode(format, circuit, t))}\n${[...runCode(format, circuit, t), 'print(counts)'].join('\n')}\n`;
}

function cell(kind: 'markdown' | 'code', id: number, lines: string[]) {
  const source = lines.map((line, k) => (k < lines.length - 1 ? `${line}\n` : line));
  return kind === 'markdown'
    ? { cell_type: kind, id: `cell-${id}`, metadata: {}, source }
    : { cell_type: kind, id: `cell-${id}`, metadata: {}, execution_count: null, outputs: [], source };
}

export function notebook(format: PythonFormat, circuit: Circuit, t: Translate, title: string): string {
  const circuitCode = generateCode(format, circuit, t).map((line) => line.text);
  const cells = [
    cell('markdown', 1, [`# ${title}`, '', t('download.notebookIntro', { framework: t(`code.format.${format}`) })]),
    cell('code', 2, circuitCode),
    cell('markdown', 3, [t('download.runIntro', { shots: SHOTS })]),
    cell('code', 4, [...runCode(format, circuit, t), 'counts']),
    cell('code', 5, plotCode(t)),
  ];
  const metadata = {
    kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' },
    language_info: { name: 'python' },
  };
  return `${JSON.stringify({ cells, metadata, nbformat: 4, nbformat_minor: 5 }, null, 1)}\n`;
}
