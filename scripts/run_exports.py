"""Runs the code Qanvas exports and saves each circuit's final state, in Qanvas's bit order.

Called by src/code/export.docker.ts inside the quantum-lab image:
python scripts/run_exports.py cases.json results.json
"""

import json
import sys
import warnings

import cirq
import numpy as np
from pyquil.quilbase import Declare, Measurement
from pyquil.simulation import NumpyWavefunctionSimulator
from pyquil.simulation.matrices import QUANTUM_GATES
from qiskit import qasm2
from qiskit.quantum_info import Statevector

warnings.filterwarnings("ignore")


def reverse_bits(amplitudes, qubits):
    # Bit order: Qiskit's statevector index has q0 as its least significant bit,
    # Qanvas's has q0 as its most significant bit, so every index is bit-reversed.
    indices = np.arange(len(amplitudes))
    reversed_indices = np.zeros_like(indices)
    for q in range(qubits):
        reversed_indices |= ((indices >> q) & 1) << (qubits - 1 - q)
    ordered = np.zeros_like(amplitudes)
    ordered[reversed_indices] = amplitudes
    return ordered


def run_python(code, name):
    namespace = {}
    exec(compile(code, f"<{name}>", "exec"), namespace)
    return namespace


def qiskit_state(code, qubits):
    qc = run_python(code, "qiskit")["qc"]
    qc.remove_final_measurements()
    return reverse_bits(Statevector(qc).data, qubits)


def qasm_state(code, qubits):
    qc = qasm2.loads(code)
    qc.remove_final_measurements()
    return reverse_bits(Statevector(qc).data, qubits)


def cirq_state(code, qubits):
    circuit = cirq.drop_terminal_measurements(run_python(code, "cirq")["circuit"])
    # Cirq's state vector already has the first qubit in qubit_order as its most significant
    # bit, like Qanvas; qubit_order also keeps qubits that no gate touches.
    return cirq.final_state_vector(circuit, qubit_order=cirq.LineQubit.range(qubits), dtype=np.complex128)


def pyquil_state(code, qubits):
    program = run_python(code, "pyquil")["program"]
    sim = NumpyWavefunctionSimulator(n_qubits=qubits)
    for gate in program.instructions:
        if isinstance(gate, (Declare, Measurement)):
            continue
        matrix = QUANTUM_GATES[gate.name]
        if gate.params:
            matrix = matrix(*gate.params)
        # do_gate ignores modifiers, so S(0).dagger() would run as S; apply them to the matrix instead.
        for modifier in gate.modifiers:
            if modifier != "DAGGER":
                raise ValueError(f"Unexpected modifier {modifier}")
            matrix = matrix.conj().T
        sim.do_gate_matrix(matrix, [q.index for q in gate.qubits])
    # The simulator's wavefunction tensor has one axis per qubit with q0 first, so flattening
    # it puts q0 in the most significant bit, like Qanvas.
    return sim.wf.reshape(-1)


RUNNERS = {"qiskit": qiskit_state, "cirq": cirq_state, "pyquil": pyquil_state, "qasm": qasm_state}


def run(case):
    results = {}
    for fmt, code in case["code"].items():
        try:
            state = RUNNERS[fmt](code, case["qubits"])
            results[fmt] = {"re": state.real.tolist(), "im": state.imag.tolist()}
        except Exception as error:  # reported per case so one failure doesn't hide the rest
            results[fmt] = {"error": f"{type(error).__name__}: {error}"}
    return {"name": case["name"], "results": results}


if __name__ == "__main__":
    cases = json.loads(open(sys.argv[1]).read())
    with open(sys.argv[2], "w") as out:
        json.dump([run(case) for case in cases], out)
