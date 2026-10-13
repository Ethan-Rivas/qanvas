# quantum-lab: noise and counted qubits in `POST /run`

For a separate quantum-lab session. Qanvas doesn't modify quantum-lab; this is the change Qanvas 0.3 needs from the bridge (`bridge/bridge.py`, `bridge/runner.py`).

## Why

Qanvas simulates circuits with noise, measurements partway through or resets in the browser for up to 8 qubits. Larger ones need the lab's Qiskit Aer runner. Today `/run`:

- runs the OpenQASM without noise;
- counts every qubit that has any `measure`, so a qubit measured partway through and used again reports its old value.

Until the bridge has this change, Qanvas shows a size note for those circuits.

## Change

1. `GET /health` adds `"noise"` to `features`. Qanvas sends the new fields only when it sees it.
2. `POST /run` accepts two optional fields:
   - `noise`: `{"oneQubit": p1, "twoQubit": p2, "readout": r}`, each a probability. Reject values outside 0 ≤ p1, p2 ≤ 0.1 and 0 ≤ r ≤ 0.2 with a 400 and `{"error": {"code": "bad-request"}}`.
   - `measured`: the qubits to count, in the order of the result keys (q0 first, as today). Each counted qubit is read from its final measurement. If a counted qubit's last instruction isn't a measurement, the runner appends one into a new one-bit classical register. A qubit measured partway and then used again but not counted is left out of the keys.
3. With `noise`, the runner builds the same `NoiseModel` as Qanvas's Qiskit export (`src/code/qiskit.ts`):
   - `depolarizing_error(p1, 1)` on `["h", "x", "y", "z", "s", "sdg", "t", "tdg", "rx", "ry", "rz", "p", "u1"]`. Qanvas's OpenQASM writes P as `u1`.
   - `depolarizing_error(p2, 2)` on `["cx", "cz", "swap"]`.
   - `depolarizing_error(p2, 3)` on `["ccx"]`.
   - `ReadoutError([[1 - r, r], [r, 1 - r]])` on every measurement, mid-circuit ones included, so a condition can act on a wrong reading.
4. Run without optimization, so each Qanvas gate stays one instruction and gets its error once. Load with plain `qasm2.loads(qasm)`, which keeps Qanvas's `swap` as one instruction, and either don't transpile or use `transpile(qc, simulator, optimization_level=0)`. Checked on Oct 13, 2026: transpiling with the legacy custom instructions removes the SWAP entirely.
5. `/import` from Cirq code skips `cirq.depolarize` channels and measurement confusion maps, which come from Qanvas's noisy Cirq export. The diagram is the circuit without noise.

## Acceptance

- `X q0; SWAP q0,q1; measure` with `twoQubit = 0.1` reports q1 = 1 with probability 0.95 (±3σ at 4000 shots). That means one 2-qubit error, not three CNOT errors and not none.
- `X q0; measure q0; if(c0==1) x q1; measure q1` with `readout = 0.2` and `measured: [1]` reports q1 = 1 with probability 0.8·0.8 + 0.2·0.2 = 0.68.
- `H q0; measure q0; reset q0; x q0` with `measured: [0]` and no measurement at the end reports q0 = 1 always.
- Without `noise` and `measured`, `/run` answers exactly as before.
- Then bump the pinned Qanvas version in quantum-lab as usual.
