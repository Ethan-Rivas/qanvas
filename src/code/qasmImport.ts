import { MAX_QUBITS, operationQubits, validateCircuit, type Circuit, type Condition, type GateName, type Operation } from '../circuit/model';

export type ImportErrorCode =
  | 'syntax'
  | 'version'
  | 'no-qubits'
  | 'too-many-qubits'
  | 'unknown-register'
  | 'unsupported-gate'
  | 'classical-control';

export interface ImportError {
  code: ImportErrorCode;
  line?: number;
  detail?: string;
}

export type ImportResult = { ok: true; circuit: Circuit } | { ok: false; error: ImportError };

class QasmError extends Error {
  constructor(public readonly error: ImportError) {
    super(error.code);
  }
}

interface Statement {
  text: string;
  line: number;
}

/** Splits the source into statements, keeping gate bodies `{ … }` whole and comments out. */
function statements(source: string): Statement[] {
  const result: Statement[] = [];
  const code = source.replace(/\/\/[^\n]*/g, '');
  let text = '';
  let line = 1;
  let start = 1;
  let depth = 0;
  for (const char of code) {
    if (!text.trim()) start = line;
    if (char === '\n') line++;
    if (char === '{') depth++;
    if (char === '}') depth--;
    if ((char === ';' && depth === 0) || (char === '}' && depth === 0)) {
      if (char === '}') text += char;
      if (text.trim()) result.push({ text: text.trim(), line: start });
      text = '';
      continue;
    }
    text += char;
  }
  if (text.trim()) result.push({ text: text.trim(), line: start });
  return result;
}

const FUNCTIONS: Record<string, (x: number) => number> = { sin: Math.sin, cos: Math.cos, tan: Math.tan, exp: Math.exp, ln: Math.log, sqrt: Math.sqrt };

/** Evaluates an OpenQASM 2 parameter such as `-3*pi/4` or `pi/2 + 0.1`. */
export function evaluate(expression: string): number {
  const tokens = expression.match(/\d+\.?\d*(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?|[a-z]+|[-+*/^()]|\S/gi) ?? [];
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];

  function primary(): number {
    const token = next();
    if (token === undefined) throw new Error('end');
    if (token === '(') {
      const value = sum();
      if (next() !== ')') throw new Error(')');
      return value;
    }
    if (token === '-') return -power();
    if (token === '+') return power();
    if (token === 'pi') return Math.PI;
    if (token in FUNCTIONS) {
      if (next() !== '(') throw new Error('(');
      const value = sum();
      if (next() !== ')') throw new Error(')');
      return FUNCTIONS[token](value);
    }
    const value = Number(token);
    if (!Number.isFinite(value)) throw new Error(token);
    return value;
  }
  function power(): number {
    const base = primary();
    return peek() === '^' ? (next(), base ** power()) : base;
  }
  function product(): number {
    let value = power();
    while (peek() === '*' || peek() === '/') value = next() === '*' ? value * power() : value / power();
    return value;
  }
  function sum(): number {
    let value = product();
    while (peek() === '+' || peek() === '-') value = next() === '+' ? value + product() : value - product();
    return value;
  }

  const value = sum();
  if (i !== tokens.length || !Number.isFinite(value)) throw new Error('trailing');
  return value;
}

type GateSpec = { gate: GateName; controls: number; angle?: boolean };

// u1 and p are the same phase gate; swap is in newer qelib1.inc versions and is defined by Qanvas's own export.
const GATES: Record<string, GateSpec> = {
  h: { gate: 'H', controls: 0 },
  x: { gate: 'X', controls: 0 },
  y: { gate: 'Y', controls: 0 },
  z: { gate: 'Z', controls: 0 },
  s: { gate: 'S', controls: 0 },
  sdg: { gate: 'Sdg', controls: 0 },
  t: { gate: 'T', controls: 0 },
  tdg: { gate: 'Tdg', controls: 0 },
  rx: { gate: 'RX', controls: 0, angle: true },
  ry: { gate: 'RY', controls: 0, angle: true },
  rz: { gate: 'RZ', controls: 0, angle: true },
  p: { gate: 'P', controls: 0, angle: true },
  u1: { gate: 'P', controls: 0, angle: true },
  cx: { gate: 'X', controls: 1 },
  CX: { gate: 'X', controls: 1 },
  cz: { gate: 'Z', controls: 1 },
  ccx: { gate: 'X', controls: 2 },
  swap: { gate: 'SWAP', controls: 0 },
};

const IGNORED = new Set(['id', 'barrier']);

/** Splits `rx(pi/2) q[0]` into its name, its parameters (matching nested parentheses) and its qubits. */
function splitGate(text: string, line: number): { name: string; params?: string; rest: string } {
  const name = /^[A-Za-z_]\w*/.exec(text)?.[0];
  if (!name) throw new QasmError({ code: 'syntax', line });
  let i = name.length;
  while (text[i] === ' ' || text[i] === '\t' || text[i] === '\n') i++;
  if (text[i] !== '(') return { name, rest: text.slice(i) };
  let depth = 0;
  for (let j = i; j < text.length; j++) {
    if (text[j] === '(') depth++;
    if (text[j] === ')' && --depth === 0) return { name, params: text.slice(i + 1, j), rest: text.slice(j + 1).trim() };
  }
  throw new QasmError({ code: 'syntax', line });
}

/**
 * Reads OpenQASM 2.0 into a Qanvas circuit. Qubits keep their numbers (q[0] is q0, with several
 * registers numbered in the order they are declared), so no bit-order conversion is needed here.
 * Each gate goes in the earliest column after the previous gates on its qubits, and on the qubit its condition reads.
 */
export function importQasm(source: string): ImportResult {
  try {
    return { ok: true, circuit: parse(source) };
  } catch (error) {
    if (error instanceof QasmError) return { ok: false, error: error.error };
    throw error;
  }
}

function parse(source: string): Circuit {
  const registers = new Map<string, { offset: number; size: number }>();
  let qubits = 0;
  const columns: Operation[][] = [];
  const lastColumn: number[] = [];
  const cregSizes = new Map<string, number>();
  // A one-bit register's measured qubit, kept only while that qubit is left alone, since a
  // condition must read a fresh measurement (see validateCircuit).
  const bitSource = new Map<string, number>();

  function place(op: Operation) {
    const used = operationQubits(op);
    const occupied = op.condition ? [...used, op.condition.qubit] : used;
    const column = Math.max(-1, ...occupied.map((q) => lastColumn[q] ?? -1)) + 1;
    (columns[column] ??= []).push(op);
    occupied.forEach((q) => (lastColumn[q] = column));
    for (const [name, q] of bitSource) if (used.includes(q)) bitSource.delete(name);
  }

  /** `q[2]` gives one qubit, `q` gives every qubit of the register. */
  function qubitsOf(arg: string, line: number): number[] {
    const match = /^([A-Za-z_]\w*)\s*(?:\[\s*(\d+)\s*\])?$/.exec(arg.trim());
    if (!match) throw new QasmError({ code: 'syntax', line });
    const register = registers.get(match[1]);
    if (!register) throw new QasmError({ code: 'unknown-register', line, detail: match[1] });
    if (match[2] === undefined) return Array.from({ length: register.size }, (_, k) => register.offset + k);
    const index = Number(match[2]);
    if (index >= register.size) throw new QasmError({ code: 'syntax', line });
    return [register.offset + index];
  }

  /** Expands whole-register arguments: `cx a, b` on two 3-qubit registers is three CNOTs. */
  function broadcast(args: string[], line: number): number[][] {
    const lists = args.map((arg) => qubitsOf(arg, line));
    const size = Math.max(...lists.map((l) => l.length));
    if (lists.some((l) => l.length !== 1 && l.length !== size)) throw new QasmError({ code: 'syntax', line });
    return Array.from({ length: size }, (_, k) => lists.map((l) => (l.length === 1 ? l[0] : l[k])));
  }

  function gate(text: string, line: number, condition?: Condition) {
    const { name, params, rest } = splitGate(text, line);
    if (IGNORED.has(name)) return;
    const spec = GATES[name];
    if (!spec) throw new QasmError({ code: 'unsupported-gate', line, detail: name });
    if (condition && (spec.controls > 0 || spec.gate === 'SWAP')) throw new QasmError({ code: 'classical-control', line });

    let angle: number | undefined;
    if (spec.angle) {
      try {
        angle = evaluate(params ?? '');
      } catch {
        throw new QasmError({ code: 'syntax', line });
      }
    } else if (params !== undefined) {
      throw new QasmError({ code: 'syntax', line });
    }

    const args = rest.split(',').map((a) => a.trim());
    const arity = spec.gate === 'SWAP' ? 2 : spec.controls + 1;
    if (args.length !== arity || args.some((a) => !a)) throw new QasmError({ code: 'syntax', line });

    for (const qs of broadcast(args, line)) {
      const op: Operation =
        spec.gate === 'SWAP'
          ? { gate: 'SWAP', targets: qs }
          : { gate: spec.gate, targets: [qs[qs.length - 1]], ...(spec.controls > 0 && { controls: qs.slice(0, -1) }) };
      if (angle !== undefined) op.angle = angle;
      if (condition) op.condition = condition;
      if (condition && qs.includes(condition.qubit)) throw new QasmError({ code: 'classical-control', line });
      if (new Set(qs).size !== qs.length) throw new QasmError({ code: 'syntax', line });
      place(op);
    }
  }

  const all = statements(source);
  all.forEach(({ text, line }, index) => {
    const [keyword] = text.split(/[\s(]/, 1);
    if (index === 0 && keyword !== 'OPENQASM') throw new QasmError({ code: 'version', line });

    switch (keyword) {
      case 'OPENQASM':
        if (!/^OPENQASM\s+2(\.\d+)?$/.test(text)) throw new QasmError({ code: 'version', line });
        return;
      case 'include':
      case 'gate':
      case 'opaque':
        return;
      case 'qreg':
      case 'creg': {
        const match = /^[qc]reg\s+([A-Za-z_]\w*)\s*\[\s*(\d+)\s*\]$/.exec(text);
        if (!match) throw new QasmError({ code: 'syntax', line });
        if (keyword === 'qreg') {
          registers.set(match[1], { offset: qubits, size: Number(match[2]) });
          qubits += Number(match[2]);
          if (qubits > MAX_QUBITS) throw new QasmError({ code: 'too-many-qubits', line, detail: String(qubits) });
        } else cregSizes.set(match[1], Number(match[2]));
        return;
      }
      case 'measure': {
        const match = /^measure\s+(.+?)\s*->\s*([A-Za-z_]\w*)\s*(?:\[\s*\d+\s*\])?$/.exec(text);
        if (!match) throw new QasmError({ code: 'syntax', line });
        for (const q of qubitsOf(match[1], line)) {
          place({ gate: 'M', targets: [q] });
          if (cregSizes.get(match[2]) === 1) bitSource.set(match[2], q);
        }
        return;
      }
      case 'reset': {
        const match = /^reset\s+(.+)$/.exec(text);
        if (!match) throw new QasmError({ code: 'syntax', line });
        for (const q of qubitsOf(match[1], line)) place({ gate: 'RESET', targets: [q] });
        return;
      }
      case 'if': {
        const match = /^if\s*\(\s*([A-Za-z_]\w*)\s*==\s*(\d+)\s*\)\s*([\s\S]+)$/.exec(text);
        if (!match) throw new QasmError({ code: 'syntax', line });
        const qubit = bitSource.get(match[1]);
        const value = Number(match[2]);
        if (qubit === undefined || value > 1 || /^(measure|reset|if)\b/.test(match[3])) throw new QasmError({ code: 'classical-control', line });
        return gate(match[3], line, { qubit, value: value as Condition['value'] });
      }
    }

    gate(text, line);
  });

  if (qubits === 0) throw new QasmError({ code: 'no-qubits' });
  // Measurements that ended up in the same column are shown as one M on several qubits.
  const merged = columns.map((column) => {
    const measures = column.filter((op) => op.gate === 'M');
    if (measures.length < 2) return column;
    return [...column.filter((op) => op.gate !== 'M'), { gate: 'M' as const, targets: measures.flatMap((op) => op.targets).sort((a, b) => a - b) }];
  });
  const circuit = { qubits, columns: merged.filter(Boolean) };
  if (validateCircuit(circuit).length > 0) throw new QasmError({ code: 'syntax' });
  return circuit;
}
