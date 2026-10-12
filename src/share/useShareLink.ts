import { useEffect } from 'react';
import { EMPTY_CIRCUIT, useEditor } from '../editor/store';
import { decodeLink, encodeLink, LINK_PREFIX, type SharedCircuit } from './share';

function isBlank({ circuit, exampleId }: SharedCircuit) {
  return !exampleId && circuit.columns.length === 0 && circuit.qubits === EMPTY_CIRCUIT.qubits;
}

/**
 * Keeps the circuit in the page's URL fragment, so a reload keeps the work and the address bar is
 * always a link to the current circuit. Opening such a link, or pasting one, loads its circuit.
 */
export function useShareLink() {
  useEffect(() => {
    let cancelled = false;
    let version = 0;

    async function open(undoable: boolean) {
      if (!location.hash.startsWith(LINK_PREFIX)) return;
      const shared = await decodeLink(location.hash);
      if (cancelled) return;
      if (!shared) {
        useEditor.setState({ notice: 'bad-link' });
        return;
      }
      if (undoable) useEditor.getState().loadCircuit(shared.circuit, shared.exampleId);
      else useEditor.setState({ ...shared, past: [], future: [], step: null, selection: null });
    }

    const onHashChange = () => open(true);
    const unsubscribe = useEditor.subscribe((state, previous) => {
      if (state.circuit === previous.circuit && state.exampleId === previous.exampleId) return;
      const current = ++version;
      if (isBlank(state)) {
        history.replaceState(null, '', location.pathname + location.search);
        return;
      }
      encodeLink(state).then((link) => {
        if (!cancelled && current === version) history.replaceState(null, '', link);
      });
    });

    open(false);
    window.addEventListener('hashchange', onHashChange);
    return () => {
      cancelled = true;
      unsubscribe();
      window.removeEventListener('hashchange', onHashChange);
    };
  }, []);
}
