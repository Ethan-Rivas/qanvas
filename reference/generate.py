"""Builds every Qanvas test circuit in Qiskit and saves its exact final state.

Run it inside the quantum-lab image with `npm run reference`. Never edit the
files in reference/data by hand.
"""

import json
import math
import random
from pathlib import Path

import numpy as np
from qiskit import QuantumCircuit
from qiskit.quantum_info import DensityMatrix, Kraus, Statevector, partial_trace
from qiskit_aer.noise import depolarizing_error

ROOT = Path(__file__).resolve().parent.parent
EXAMPLES = ROOT / "src" / "examples" / "circuits.json"
OUT = ROOT / "reference" / "data"

SEED = 20261011
RANDOM_CIRCUITS = 200
DYNAMIC_CIRCUITS = 36
MEASURE = Kraus([np.array([[1, 0], [0, 0]]), np.array([[0, 0], [0, 1]])])
RESET = Kraus([np.array([[1, 0], [0, 0]]), np.array([[0, 1], [0, 0]])])
NOISY_CIRCUITS = 24
MAX_RECORDS = 3
RECORD = QuantumCircuit(2)
RECORD.cx(0, 1)

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


def referenced(op):
    qubits = op["targets"] + op.get("controls", [])
    return qubits + [op["condition"]["qubit"]] if "condition" in op else qubits


def partway_measurements(circuit):
    # Mirrors partwayMeasurements in src/circuit/model.ts: only a measurement whose qubit is used
    # again later changes the state; terminal ones leave it as is, as in Qanvas.
    marked, used_later = set(), set()
    for c in range(len(circuit["columns"]) - 1, -1, -1):
        column = circuit["columns"][c]
        for op in column:
            if op["gate"] == "M":
                marked.update((c, q) for q in op["targets"] if q in used_later)
        for op in column:
            used_later.update(referenced(op))
    return marked


def final_density(circuit):
    partway = partway_measurements(circuit)
    dm = DensityMatrix.from_label("0" * circuit["qubits"])
    for c, column in enumerate(circuit["columns"]):
        for op in column:
            if op["gate"] == "M":
                for q in op["targets"]:
                    if (c, q) in partway:
                        dm = dm.evolve(MEASURE, qargs=[q])
            elif op["gate"] == "RESET":
                dm = dm.evolve(RESET, qargs=op["targets"])
            elif "condition" in op:
                # The condition qubit was measured and left alone since, so a gate controlled by its
                # 0/1 value acts exactly like one conditioned on the measured bit (deferred measurement).
                plain = {key: value for key, value in op.items() if key != "condition"}
                gate = to_qiskit({"qubits": 1, "columns": [[{**plain, "targets": [0]}]]}).to_gate()
                condition = op["condition"]
                dm = dm.evolve(gate.control(1, ctrl_state=condition["value"]), qargs=[condition["qubit"], op["targets"][0]])
            else:
                dm = dm.evolve(to_qiskit({"qubits": circuit["qubits"], "columns": [[op]]}))
    return dm


def qanvas_order_matrix(matrix, qubits):
    # Bit order: Qiskit indexes ρ with q0 as the least significant bit of both the row and the
    # column, Qanvas with q0 as the most significant, so both indices are bit-reversed.
    reversed_index = [int(format(i, f"0{qubits}b")[::-1], 2) for i in range(2**qubits)]
    ordered = np.empty_like(matrix)
    ordered[np.ix_(reversed_index, reversed_index)] = matrix
    return ordered


def density_case(name, circuit):
    rho = qanvas_order_matrix(final_density(circuit).data, circuit["qubits"]).reshape(-1)
    return {"name": name, "circuit": circuit, "density": {"re": rho.real.tolist(), "im": rho.imag.tolist()}}


def noise(one=0.0, two=0.0, readout=0.0):
    return {"oneQubit": one, "twoQubit": two, "readout": readout}


def read_measurements(circuit):
    """(column, qubit) of each measurement a condition reads: that qubit's latest one before it."""
    read, latest = set(), {}
    for c, column in enumerate(circuit["columns"]):
        for op in column:
            if "condition" in op:
                read.add(latest[op["condition"]["qubit"]])
        for op in column:
            if op["gate"] == "M":
                latest.update((q, (c, q)) for q in op["targets"])
    return read


def depolarizing(p, k):
    return Kraus(depolarizing_error(p, k).to_quantumchannel())


def misreading(p):
    return Kraus([math.sqrt(1 - p) * np.eye(2), math.sqrt(p) * np.array([[0, 1], [1, 0]])])


def when_recorded(channel, value):
    """`channel` on the target only where the record qubit (qarg 0) holds `value`."""
    on, off = np.diag([1 - value, value]), np.diag([value, 1 - value])
    # Qiskit's matrices put qarg 0 last in the tensor product.
    return Kraus([np.kron(k, on) for k in channel.data] + [np.kron(np.eye(2), off)])


def noisy_density(circuit):
    """The final state with Qiskit Aer's depolarizing channels after each gate.

    Each measurement a condition reads is copied onto an extra record qubit, which the readout error
    can flip, so the condition reads the record rather than the qubit, like a classical bit on hardware.
    The record qubits are traced out at the end.
    """
    n, rates = circuit["qubits"], circuit["noise"]
    partway = partway_measurements(circuit)
    records = {key: n + i for i, key in enumerate(sorted(read_measurements(circuit)))}
    total = n + len(records)
    dm = DensityMatrix.from_label("0" * total)
    record_of = {}
    for c, column in enumerate(circuit["columns"]):
        for op in column:
            name, qubits = op["gate"], op.get("controls", []) + op["targets"]
            if name == "M":
                for q in op["targets"]:
                    if (c, q) in partway:
                        dm = dm.evolve(MEASURE, qargs=[q])
                    if (c, q) in records:
                        record = records[(c, q)]
                        dm = dm.evolve(RECORD, qargs=[q, record])
                        if rates["readout"] > 0:
                            dm = dm.evolve(misreading(rates["readout"]), qargs=[record])
                        record_of[q] = record
                continue
            if name == "RESET":
                dm = dm.evolve(RESET, qargs=op["targets"])
                continue
            p = rates["oneQubit"] if len(qubits) == 1 else rates["twoQubit"]
            if "condition" in op:
                condition, target = op["condition"], op["targets"][0]
                record = record_of[condition["qubit"]]
                plain = {key: value for key, value in op.items() if key != "condition"}
                unitary = to_qiskit({"qubits": 1, "columns": [[{**plain, "targets": [0]}]]}).to_gate()
                dm = dm.evolve(unitary.control(1, ctrl_state=condition["value"]), qargs=[record, target])
                if p > 0:
                    dm = dm.evolve(when_recorded(depolarizing(p, 1), condition["value"]), qargs=[record, target])
            else:
                dm = dm.evolve(to_qiskit({"qubits": total, "columns": [[op]]}))
                if p > 0:
                    dm = dm.evolve(depolarizing(p, len(qubits)), qargs=qubits)
    return partial_trace(dm, list(range(n, total))) if records else dm


def readout_probabilities(rho, qubits, readout):
    p = np.real(np.diag(rho)).copy()
    for q in range(qubits):
        # rho is already in Qanvas order, where q0 is the most significant bit.
        flipped = p[np.arange(len(p)) ^ (1 << (qubits - 1 - q))]
        p = (1 - readout) * p + readout * flipped
    return p


def noise_case(name, circuit):
    rho = qanvas_order_matrix(noisy_density(circuit).data, circuit["qubits"])
    flat = rho.reshape(-1)
    return {
        "name": name,
        "circuit": circuit,
        "density": {"re": flat.real.tolist(), "im": flat.imag.tolist()},
        "probabilities": readout_probabilities(rho, circuit["qubits"], circuit["noise"]["readout"]).tolist(),
    }


def fixed_noise_cases():
    cnot = {"gate": "X", "controls": [0], "targets": [1]}
    if_measured = lambda qubit, value: {"condition": {"qubit": qubit, "value": value}}
    return [
        noise_case("depolarizing after X", {"qubits": 1, "columns": [[gate("X", 0)]], "noise": noise(one=0.1)}),
        noise_case("noisy Bell pair", {"qubits": 2, "columns": [[gate("H", 0)], [cnot]], "noise": noise(0.02, 0.05, 0.03)}),
        noise_case("noisy Toffoli and SWAP", {"qubits": 3, "columns": [[gate("H", 0), gate("H", 1)], [{"gate": "X", "controls": [0, 1], "targets": [2]}], [gate("SWAP", 0, 2)]], "noise": noise(0.01, 0.08)}),
        noise_case("readout only", {"qubits": 2, "columns": [[gate("H", 0)], [cnot], [gate("M", 0, 1)]], "noise": noise(readout=0.2)}),
        noise_case("a misread measurement drives a condition", {"qubits": 2, "columns": [[gate("X", 0)], [gate("M", 0)], [gate("X", 1, **if_measured(0, 1))]], "noise": noise(readout=0.2)}),
        noise_case("two conditions read one measurement", {"qubits": 3, "columns": [[gate("H", 0)], [gate("M", 0)], [gate("X", 1, **if_measured(0, 1)), gate("X", 2, **if_measured(0, 1))]], "noise": noise(readout=0.1)}),
        noise_case("noise on a gate that may not run", {"qubits": 2, "columns": [[gate("X", 0)], [gate("M", 0)], [gate("X", 1, **if_measured(0, 0))]], "noise": noise(one=0.1)}),
        noise_case("reset with noise", {"qubits": 2, "columns": [[gate("H", 0)], [cnot], [gate("RESET", 0)], [gate("RY", 0, angle=0.9)]], "noise": noise(0.03, 0.04, 0.05)}),
    ] + [
        noise_case(f"noisy teleportation θ={theta:.4g} φ={phi:.4g}", {**teleportation(theta, phi), "noise": noise(0.01, 0.03, 0.05)})
        for theta, phi in [(0.7, 1.3), (math.pi / 2, -2.0)]
    ]


def random_noise_cases():
    rng = random.Random(SEED + 2)
    cases = []
    for i in range(NOISY_CIRCUITS):
        qubits = 1 + i % 4
        if i % 2 == 0:
            columns = []
            for _ in range(rng.randint(1, 10)):
                free = list(range(qubits))
                rng.shuffle(free)
                column = [random_op(rng, free)]
                while free and rng.random() < 0.7:
                    column.append(random_op(rng, free))
                columns.append(column)
            columns.append([gate("M", *range(qubits))])
            circuit = {"qubits": qubits, "columns": columns}
        else:
            circuit = random_dynamic_circuit(rng, qubits)
            while len(read_measurements(circuit)) > MAX_RECORDS:
                circuit = random_dynamic_circuit(rng, qubits)
        circuit["noise"] = noise(round(rng.uniform(0, 0.1), 3), round(rng.uniform(0, 0.1), 3), round(rng.uniform(0, 0.2), 3))
        cases.append(noise_case(f"random noisy {i:03d} ({qubits} qubits)", circuit))
    return cases


def gate(name, *targets, **extra):
    return {"gate": name, "targets": list(targets), **extra}


def fixed_dynamic_cases():
    if_measured = lambda qubit, value: {"condition": {"qubit": qubit, "value": value}}
    cnot = {"gate": "X", "controls": [0], "targets": [1]}
    return [
        density_case("measure then H", {"qubits": 1, "columns": [[gate("H", 0)], [gate("M", 0)], [gate("H", 0)]]}),
        density_case("reset after X", {"qubits": 1, "columns": [[gate("X", 0)], [gate("RESET", 0)]]}),
        density_case("reset half of a Bell pair", {"qubits": 2, "columns": [[gate("H", 0)], [cnot], [gate("RESET", 0)]]}),
        density_case("X if q0 measured 1", {"qubits": 2, "columns": [[gate("X", 0)], [gate("M", 0)], [gate("X", 1, **if_measured(0, 1))]]}),
        density_case("X if q0 measured 0", {"qubits": 2, "columns": [[gate("H", 0)], [gate("M", 0)], [gate("X", 1, **if_measured(0, 0))]]}),
        density_case("measure twice", {"qubits": 1, "columns": [[gate("H", 0)], [gate("M", 0)], [gate("RY", 0, angle=0.8)], [gate("M", 0)]]}),
    ]


def teleportation(theta, phi):
    return {"qubits": 3, "columns": [
        [gate("RY", 0, angle=theta), gate("H", 1)],
        [gate("RZ", 0, angle=phi), {"gate": "X", "controls": [1], "targets": [2]}],
        [{"gate": "X", "controls": [0], "targets": [1]}],
        [gate("H", 0)],
        [gate("M", 0, 1)],
        [gate("X", 2, condition={"qubit": 1, "value": 1})],
        [gate("Z", 2, condition={"qubit": 0, "value": 1})],
    ]}


def teleportation_cases():
    return [
        density_case(f"teleportation θ={theta:.4g} φ={phi:.4g}", teleportation(theta, phi))
        for theta in [0, 0.7, math.pi / 2, 2.2, math.pi]
        for phi in [0, 1.3, -2.0]
    ]


def random_dynamic_circuit(rng, qubits):
    columns = []
    readable = set()
    for _ in range(rng.randint(2, 12)):
        free = list(range(qubits))
        rng.shuffle(free)
        column = []
        while free and (not column or rng.random() < 0.7):
            kind = rng.choice(["gate", "gate", "measure", "reset", "conditional"])
            candidates = [q for q in free if q in readable]
            if kind == "measure":
                column.append(gate("M", free.pop()))
            elif kind == "reset":
                column.append(gate("RESET", free.pop()))
            elif kind == "conditional" and candidates and len(free) >= 2:
                read = candidates[0]
                free.remove(read)
                name = rng.choice(list(FIXED_GATES) + list(ANGLE_GATES))
                op = gate(name, free.pop(), condition={"qubit": read, "value": rng.randint(0, 1)})
                if name in ANGLE_GATES:
                    op["angle"] = rng.uniform(-2 * math.pi, 2 * math.pi)
                column.append(op)
            else:
                column.append(random_op(rng, free))
        columns.append(column)
        for op in column:
            readable.difference_update(op["targets"] + op.get("controls", []))
        readable.update(q for op in column if op["gate"] == "M" for q in op["targets"])
    circuit = {"qubits": qubits, "columns": columns}
    if not partway_measurements(circuit) and not any(op["gate"] == "RESET" for column in columns for op in column):
        columns.append([gate("RESET", 0)])
    return circuit


def random_dynamic_cases():
    rng = random.Random(SEED + 1)
    return [density_case(f"random dynamic {i:03d} ({1 + i % 6} qubits)", random_dynamic_circuit(rng, 1 + i % 6)) for i in range(DYNAMIC_CIRCUITS)]


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
    write("mid-circuit", fixed_dynamic_cases() + teleportation_cases() + random_dynamic_cases())
    write("noise", fixed_noise_cases() + random_noise_cases())
