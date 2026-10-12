"""Runs the scripts and notebooks Qanvas downloads and saves the counts each one prints.

Called by src/code/export.docker.ts inside the quantum-lab image:
python scripts/run_downloads.py cases.json results.json
"""

import ast
import json
import os
import subprocess
import sys
import tempfile

import nbformat
from jupyter_client import KernelManager
from nbclient import NotebookClient


def run_script(code):
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as file:
        file.write(code)
    done = subprocess.run([sys.executable, file.name], capture_output=True, text=True, timeout=300)
    os.unlink(file.name)
    if done.returncode != 0:
        raise RuntimeError(done.stderr.strip().splitlines()[-1])
    if done.stderr.strip():
        raise RuntimeError(f"Printed warnings or errors: {done.stderr.strip()[:300]}")
    return ast.literal_eval(done.stdout.strip().splitlines()[-1])


def run_notebook(text):
    notebook = nbformat.reads(text, as_version=4)
    nbformat.validate(notebook)
    # IPC keeps the kernel off TCP, which it otherwise warns about on every start.
    NotebookClient(notebook, timeout=300, km=KernelManager(kernel_name="python3", transport="ipc", ip=os.path.join(tempfile.mkdtemp(), "kernel"))).execute()
    counts_cell = next(cell for cell in notebook.cells if cell.cell_type == "code" and cell.source.endswith("counts"))
    # Students read anything on stderr, such as a deprecation warning, as the notebook failing.
    noise = [output.text for cell in notebook.cells if cell.cell_type == "code" for output in cell.outputs if output.get("name") == "stderr"]
    if noise:
        raise RuntimeError(f"Printed warnings or errors: {noise[0][:300]}")
    result = next(output for output in counts_cell.outputs if output.output_type == "execute_result")
    plots = [output for output in notebook.cells[-1].outputs if "image/png" in output.get("data", {})]
    if not plots:
        raise RuntimeError("The plot cell drew nothing")
    return ast.literal_eval(result["data"]["text/plain"])


def run(case):
    results = {}
    for kind, runner in [("script", run_script), ("notebook", run_notebook)]:
        for fmt, text in case.get(kind, {}).items():
            try:
                results[f"{fmt} {kind}"] = {"counts": runner(text)}
            except Exception as error:  # reported per case so one failure doesn't hide the rest
                results[f"{fmt} {kind}"] = {"error": f"{type(error).__name__}: {error}"}
    return {"name": case["name"], "results": results}


if __name__ == "__main__":
    cases = json.loads(open(sys.argv[1]).read())
    with open(sys.argv[2], "w") as out:
        json.dump([run(case) for case in cases], out)
