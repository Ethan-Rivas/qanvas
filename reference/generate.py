"""Builds every Qanvas test circuit in Qiskit and saves its exact final state.

Run it inside the quantum-lab image with `npm run reference`. Never edit the
files in reference/data by hand.
"""

import json
import math
import random
from pathlib import Path

from qiskit import QuantumCircuit
from qiskit.quantum_info import Statevector

ROOT = Path(__file__).resolve().parent.parent
EXAMPLES = ROOT / "src" / "examples" / "circuits.json"
OUT = ROOT / "reference" / "data"

SEED = 20261011
RANDOM_CIRCUITS = 200

FIXED_GATES = {"H": "h", "X": "x", "Y": "y", "Z": "z", "S": "s", "Sdg": "sdg", "T": "t", "Tdg": "tdg"}
ANGLE_GATES = {"RX": "rx", "RY": "ry", "RZ": "rz", "P": "p"}
TEST_ANGLES = [0.3, -1.7, math.pi]


def to_qiskit(circuit):
    # Qanvas qubit q is Qiskit qubit q; only the statevector index order differs (see qanvas_order).
    qc = QuantumCircuit(circuit["qubits"])
    for column in circuit["columns"]:
        for op in column:
            gate, targets, controls = op["gate"], op["targets"], op.get("controls", [])
            if gate == "M":
                # Measurements are terminal in Qanvas 0.1 and Statevector can't hold them.
                continue
            if gate == "SWAP":
                qc.swap(*targets)
            elif gate == "X" and len(controls) == 2:
                qc.ccx(controls[0], controls[1], targets[0])
            elif gate == "X" and len(controls) == 1:
                qc.cx(controls[0], targets[0])
            elif gate == "Z" and len(controls) == 1:
                qc.cz(controls[0], targets[0])
            elif controls:
                raise ValueError(f"Unsupported controlled gate: {op}")
            elif gate in FIXED_GATES:
                getattr(qc, FIXED_GATES[gate])(targets[0])
            elif gate in ANGLE_GATES:
                getattr(qc, ANGLE_GATES[gate])(op["angle"], targets[0])
            else:
                raise ValueError(f"Unknown gate: {op}")
    return qc


def qanvas_order(amplitudes, qubits):
    # Bit order: Qiskit's statevector index has q0 as its least significant bit,
    # Qanvas's has q0 as its most significant bit, so every index is bit-reversed.
    ordered = [0j] * len(amplitudes)
    for qiskit_index, amplitude in enumerate(amplitudes):
        qanvas_index = int(format(qiskit_index, f"0{qubits}b")[::-1], 2)
        ordered[qanvas_index] = complex(amplitude)
    return ordered


def case(name, circuit):
    amplitudes = qanvas_order(Statevector(to_qiskit(circuit)).data, circuit["qubits"])
    return {
        "name": name,
        "circuit": circuit,
        "state": {"re": [a.real for a in amplitudes], "im": [a.imag for a in amplitudes]},
    }


def prepared(qubits, column):
    # A gate acting on |0…0⟩ often does nothing visible (Z, S, T, controls),
    # so each gate runs on a distinct, non-trivial state on every qubit first.
    prep = [
        [{"gate": "RY", "targets": [q], "angle": 0.4 + 0.7 * q} for q in range(qubits)],
        [{"gate": "RZ", "targets": [q], "angle": -0.3 + 1.1 * q} for q in range(qubits)],
    ]
    return {"qubits": qubits, "columns": prep + [column]}


def single_gate_cases():
    cases = []
    for qubits in (1, 3):
        for target in range(qubits):
            where = f"q{target} of {qubits}"
            for gate in FIXED_GATES:
                cases.append(case(f"{gate} {where}", prepared(qubits, [{"gate": gate, "targets": [target]}])))
            for gate in ANGLE_GATES:
                for angle in TEST_ANGLES:
                    op = {"gate": gate, "targets": [target], "angle": angle}
                    cases.append(case(f"{gate}({angle:.4g}) {where}", prepared(qubits, [op])))

    qubits = 4
    for a in range(qubits):
        for b in range(qubits):
            if a == b:
                continue
            where = f"of {qubits}"
            cases.append(case(f"CNOT c{a} t{b} {where}", prepared(qubits, [{"gate": "X", "controls": [a], "targets": [b]}])))
            cases.append(case(f"CZ c{a} t{b} {where}", prepared(qubits, [{"gate": "Z", "controls": [a], "targets": [b]}])))
            cases.append(case(f"SWAP q{a} q{b} {where}", prepared(qubits, [{"gate": "SWAP", "targets": [a, b]}])))
            for t in range(qubits):
                if t in (a, b):
                    continue
                op = {"gate": "X", "controls": [a, b], "targets": [t]}
                cases.append(case(f"Toffoli c{a} c{b} t{t} {where}", prepared(qubits, [op])))
    return cases


def example_cases():
    examples = json.loads(EXAMPLES.read_text())
    return [case(name, circuit) for name, circuit in examples.items()]


def random_op(rng, free):
    choices = ["fixed", "angle"]
    if len(free) >= 2:
        choices += ["cnot", "cz", "swap"]
    if len(free) >= 3:
        choices.append("toffoli")
    kind = rng.choice(choices)
    take = lambda k: [free.pop() for _ in range(k)]

    if kind == "fixed":
        return {"gate": rng.choice(list(FIXED_GATES)), "targets": take(1)}
    if kind == "angle":
        return {"gate": rng.choice(list(ANGLE_GATES)), "targets": take(1), "angle": rng.uniform(-2 * math.pi, 2 * math.pi)}
    if kind == "swap":
        return {"gate": "SWAP", "targets": take(2)}
    if kind == "toffoli":
        return {"gate": "X", "controls": take(2), "targets": take(1)}
    return {"gate": "X" if kind == "cnot" else "Z", "controls": take(1), "targets": take(1)}


def random_cases():
    rng = random.Random(SEED)
    cases = []
    for i in range(RANDOM_CIRCUITS):
        qubits = 1 + i % 12
        columns = []
        for _ in range(rng.randint(1, 20)):
            free = list(range(qubits))
            rng.shuffle(free)
            column = [random_op(rng, free)]
            while free and rng.random() < 0.7:
                column.append(random_op(rng, free))
            columns.append(column)
        if rng.random() < 0.5:
            measured = sorted(rng.sample(range(qubits), rng.randint(1, qubits)))
            columns.append([{"gate": "M", "targets": measured}])
        cases.append(case(f"random {i:03d} ({qubits} qubits)", {"qubits": qubits, "columns": columns}))
    return cases


def write(name, cases):
    OUT.mkdir(parents=True, exist_ok=True)
    lines = ",\n".join(json.dumps(c, separators=(",", ":")) for c in cases)
    (OUT / f"{name}.json").write_text(f"[\n{lines}\n]\n")
    print(f"{name}: {len(cases)} circuits")


if __name__ == "__main__":
    write("single-gate", single_gate_cases())
    write("examples", example_cases())
    write("random", random_cases())
