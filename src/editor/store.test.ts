import { beforeEach, expect, it } from 'vitest';
import { EMPTY_CIRCUIT, useEditor } from './store';

beforeEach(() => useEditor.setState({ circuit: EMPTY_CIRCUIT, exampleId: null, past: [], future: [], selection: null, notice: null }));

it('undoes and redoes edits, and selects the gate that was placed', () => {
  const { placeGate, undo, redo } = useEditor.getState();
  placeGate('H', { column: 0, qubit: 0 });
  placeGate('X', { column: 1, qubit: 2 });
  expect(useEditor.getState().selection).toEqual({ column: 1, index: 0 });

  undo();
  expect(useEditor.getState().circuit.columns).toEqual([[{ gate: 'H', targets: [0] }]]);
  redo();
  expect(useEditor.getState().circuit.columns).toHaveLength(2);
});

it('keeps the circuit and history unchanged when an edit is rejected', () => {
  const { placeGate, setCondition } = useEditor.getState();
  placeGate('H', { column: 0, qubit: 0 });
  const before = useEditor.getState().past;
  setCondition({ column: 0, index: 0 }, { qubit: 1, value: 1 });
  expect(useEditor.getState()).toMatchObject({ notice: 'condition', past: before });
});
