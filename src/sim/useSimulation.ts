import { useEffect, useRef, useState } from 'react';
import { browserLimit, type Circuit } from '../circuit/model';
import type { Simulation } from './simulator';
import type { SimulationRequest, SimulationResponse } from './worker';

export { stateAt } from './simulator';

/** Every step's state for `circuit`, which is kept so the states and the circuit always agree. */
export type SimulationResult = Simulation & { circuit: Circuit };

/** Runs the simulator off the main thread and returns the latest result for `circuit`. */
export function useSimulation(circuit: Circuit | null): { result: SimulationResult | null; pending: boolean } {
  const worker = useRef<Worker | null>(null);
  const latest = useRef<{ id: number; circuit: Circuit | null }>({ id: 0, circuit });
  // While the worker is busy only the newest request waits, so a dragged slider doesn't pile up runs.
  const busy = useRef(false);
  const waiting = useRef<SimulationRequest | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [pending, setPending] = useState(true);

  useEffect(() => {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (event: MessageEvent<SimulationResponse>) => {
      const response = event.data;
      if (waiting.current) {
        w.postMessage(waiting.current);
        waiting.current = null;
      } else busy.current = false;
      // Edits can arrive faster than results; only the newest request's answer is shown.
      if (response.id !== latest.current.id) return;
      setPending(false);
      if ('error' in response) {
        console.error(response.error);
        return;
      }
      const { circuit: simulated } = latest.current;
      if (simulated) setResult({ circuit: simulated, qubits: simulated.qubits, mixed: response.mixed, re: response.re, im: response.im });
    };
    worker.current = w;
    return () => {
      w.terminate();
      worker.current = null;
      busy.current = false;
      waiting.current = null;
    };
  }, []);

  useEffect(() => {
    latest.current = { id: latest.current.id + 1, circuit };
    // Every step's state of a larger circuit doesn't fit in the browser; quantum-lab runs those on Aer.
    if (!circuit || circuit.qubits > browserLimit(circuit)) {
      waiting.current = null;
      setResult(null);
      setPending(false);
      return;
    }
    setPending(true);
    const request: SimulationRequest = { id: latest.current.id, circuit };
    if (busy.current) waiting.current = request;
    else if (worker.current) {
      worker.current.postMessage(request);
      busy.current = true;
    }
  }, [circuit]);

  return { result, pending };
}
