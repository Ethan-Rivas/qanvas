import { useEffect, useRef, useState } from 'react';
import type { Circuit } from '../circuit/model';
import type { SimulationRequest, SimulationResponse } from './worker';

export interface SimulationResult {
  qubits: number;
  probabilities: Float64Array;
}

/** Runs the simulator off the main thread and returns the latest result for `circuit`. */
export function useSimulation(circuit: Circuit): { result: SimulationResult | null; pending: boolean } {
  const worker = useRef<Worker | null>(null);
  const latest = useRef(0);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [pending, setPending] = useState(true);

  useEffect(() => {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (event: MessageEvent<SimulationResponse>) => {
      const response = event.data;
      // Edits can arrive faster than results; only the newest request's answer is shown.
      if (response.id !== latest.current) return;
      setPending(false);
      if ('error' in response) {
        console.error(response.error);
        return;
      }
      setResult({ qubits: response.qubits, probabilities: response.probabilities });
    };
    worker.current = w;
    return () => {
      w.terminate();
      worker.current = null;
    };
  }, []);

  useEffect(() => {
    const id = ++latest.current;
    setPending(true);
    worker.current?.postMessage({ id, circuit } satisfies SimulationRequest);
  }, [circuit]);

  return { result, pending };
}
