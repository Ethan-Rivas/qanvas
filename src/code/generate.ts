import type { Circuit } from '../circuit/model';
import type { Translate } from '../i18n/i18n';
import { toCirq } from './cirq';
import type { CodeFormat, CodeLine, Generator } from './common';
import { toPyQuil } from './pyquil';
import { toQasm } from './qasm';
import { toQiskit } from './qiskit';

export type { CodeFormat, CodeLine } from './common';

export const CODE_FORMATS: CodeFormat[] = ['qiskit', 'cirq', 'pyquil', 'qasm'];

const GENERATORS: Record<CodeFormat, Generator> = { qiskit: toQiskit, cirq: toCirq, pyquil: toPyQuil, qasm: toQasm };

export function generateCode(format: CodeFormat, circuit: Circuit, t: Translate): CodeLine[] {
  return GENERATORS[format](circuit, t);
}

export function codeText(lines: CodeLine[]): string {
  return `${lines.map((line) => line.text).join('\n')}\n`;
}
