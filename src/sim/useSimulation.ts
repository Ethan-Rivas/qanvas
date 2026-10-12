import { useEffect, useRef, useState } from 'react';
import { BROWSER_QUBITS, type Circuit } from '../circuit/model';
import type { StateVector } from './simulator';
import type { SimulationRequest, SimulationResponse } from './worker';

/** Every step's state for `circuit`, which is kept so the states and the circuit always agree. */
export interface SimulationResult {
  circuit: Circuit;
  re: Float64Array;
  im: Float64Array;
}

export function stateAt(result: SimulationResult, step: number): StateVector {
  const { qubits } = result.circuit;
  const size = 1 << qubits;
  const k = Math.min(step, result.circuit.columns.length);
  return { qubits, re: result.re.subarray(k * size, (k + 1) * size), im: result.im.subarray(k * size, (k + 1) * size) };
}

/** Runs the simulator off the main thread and returns the latest result for `circuit`. */
export function useSimulation(circuit: Circuit): { result: SimulationResult | null; pending: boolean } {
  const worker = useRef<Worker | null>(null);
  const latest = useRef({ id: 0, circuit });
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [pending, setPending] = useState(true);

  useEffect(() => {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (event: MessageEvent<SimulationResponse>) => {
      const response = event.data;
      // Edits can arrive faster than results; only the newest request's answer is shown.
      if (response.id !== latest.current.id) return;
      setPending(false);
      if ('error' in response) {
        console.error(response.error);
        return;
      }
      setResult({ circuit: latest.current.circuit, re: response.re, im: response.im });
    };
    worker.current = w;
    return () => {
      w.terminate();
      worker.current = null;
    };
  }, []);

  useEffect(() => {
    latest.current = { id: latest.current.id + 1, circuit };
    // Every step's state of a larger circuit doesn't fit in the browser; quantum-lab runs those on Aer.
    if (circuit.qubits > BROWSER_QUBITS) {
      setResult(null);
      setPending(false);
      return;
    }
    setPending(true);
    worker.current?.postMessage({ id: latest.current.id, circuit } satisfies SimulationRequest);
  }, [circuit]);

  return { result, pending };
}
