import { validateCircuit, type Circuit } from '../circuit/model';
import { isExampleId, type ExampleId } from '../examples/examples';

export interface SharedCircuit {
  circuit: Circuit;
  exampleId: ExampleId | null;
}

const FILE_FORMAT = 'qanvas';
const FILE_VERSION = 1;
export const LINK_PREFIX = '#c=';

async function transform(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const output = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(output).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Checks untrusted data (a link or a file) and returns it as a circuit, or null. */
function readShared(data: unknown): SharedCircuit | null {
  if (typeof data !== 'object' || data === null) return null;
  const { circuit, example } = data as { circuit?: unknown; example?: unknown };
  if (typeof circuit !== 'object' || circuit === null || !Array.isArray((circuit as Circuit).columns)) return null;
  const valid = (circuit as Circuit).columns.every((column) => Array.isArray(column) && column.every((op) => typeof op === 'object' && op !== null && Array.isArray(op.targets)));
  if (!valid || validateCircuit(circuit as Circuit).length > 0) return null;
  return { circuit: circuit as Circuit, exampleId: typeof example === 'string' && isExampleId(example) ? example : null };
}

/** The circuit, compressed into the URL fragment, which never leaves the browser. */
export async function encodeLink({ circuit, exampleId }: SharedCircuit): Promise<string> {
  const json = JSON.stringify(exampleId ? { circuit, example: exampleId } : { circuit });
  return LINK_PREFIX + toBase64Url(await transform(new TextEncoder().encode(json), new CompressionStream('deflate-raw')));
}

export async function decodeLink(hash: string): Promise<SharedCircuit | null> {
  if (!hash.startsWith(LINK_PREFIX)) return null;
  try {
    const bytes = await transform(fromBase64Url(hash.slice(LINK_PREFIX.length)), new DecompressionStream('deflate-raw'));
    return readShared(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}

export function toFile({ circuit, exampleId }: SharedCircuit): string {
  return `${JSON.stringify({ format: FILE_FORMAT, version: FILE_VERSION, ...(exampleId && { example: exampleId }), circuit }, null, 2)}\n`;
}

export function fromFile(text: string): SharedCircuit | null {
  try {
    const data = JSON.parse(text);
    if (data?.format !== FILE_FORMAT || data.version !== FILE_VERSION) return null;
    return readShared(data);
  } catch {
    return null;
  }
}
