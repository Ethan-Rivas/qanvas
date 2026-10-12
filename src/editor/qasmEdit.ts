import { sameCircuit, type Circuit } from '../circuit/model';
import { codeText, generateCode } from '../code/generate';
import { importQasm, type ImportError } from '../code/qasmImport';
import type { Translate } from '../i18n/i18n';

/**
 * The circuit edited OpenQASM gives, or `circuit: null` when it gives the circuit already shown.
 * OpenQASM has no columns, so the current circuit is compared as the importer would lay it out;
 * otherwise a new blank line would rebuild the diagram and add an undo step that changes nothing.
 */
export function readQasmEdit(text: string, current: Circuit, t: Translate): { ok: true; circuit: Circuit | null } | { ok: false; error: ImportError } {
  const result = importQasm(text);
  if (!result.ok) return result;
  const shown = importQasm(codeText(generateCode('qasm', current, t)));
  return { ok: true, circuit: shown.ok && sameCircuit(shown.circuit, result.circuit) ? null : result.circuit };
}
