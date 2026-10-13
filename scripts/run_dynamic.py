"""Runs the code Qanvas exports for dynamic circuits and saves the counts each one gives.

Called by src/code/export.docker.ts inside the quantum-lab image:
python scripts/run_dynamic.py cases.json results.json
"""

import json
import sys
import warnings

from qiskit import qasm2
from qiskit_aer.primitives import SamplerV2

from run_downloads import run_script
from run_exports import run_python

warnings.filterwarnings("ignore")


def qasm_counts(code, counted, shots):
    raw = SamplerV2().run([qasm2.loads(code)], shots=shots).result()[0].join_data().get_counts()
    # Bit order: Qiskit's bitstrings put q0 last, so they're reversed to read q0 first like Qanvas.
    counts = {}
    for bits, n in raw.items():
        key = "".join(bits[::-1][q] for q in counted)
        counts[key] = counts.get(key, 0) + n
    return counts


def run(case):
    results = {}
    for fmt, code in case["script"].items():
        try:
            results[f"{fmt} script"] = {"counts": run_script(code)}
        except Exception as error:  # reported per case so one failure doesn't hide the rest
            results[f"{fmt} script"] = {"error": f"{type(error).__name__}: {error}"}
    if case["measuresAtEnd"]:
        try:
            results["qasm on Aer"] = {"counts": qasm_counts(case["qasm"], case["counted"], case["shots"])}
        except Exception as error:
            results["qasm on Aer"] = {"error": f"{type(error).__name__}: {error}"}
    # OpenQASM written by Qiskit itself, which Qanvas must be able to import.
    try:
        qiskit_qasm = qasm2.dumps(run_python(case["qiskit"], "qiskit")["qc"])
    except Exception as error:
        qiskit_qasm = f"error: {type(error).__name__}: {error}"
    return {"name": case["name"], "results": results, "qiskitQasm": qiskit_qasm}


if __name__ == "__main__":
    cases = json.loads(open(sys.argv[1]).read())
    with open(sys.argv[2], "w") as out:
        json.dump([run(case) for case in cases], out)
