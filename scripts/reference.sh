#!/bin/sh
# Regenerates reference/data with Qiskit, using the quantum-lab image.
# Use a local build with: QUANTUM_LAB_IMAGE=quantum-lab:local npm run reference
set -eu
IMAGE="${QUANTUM_LAB_IMAGE:-ghcr.io/ethan-rivas/quantum-lab:latest}"
docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$(pwd):/qanvas" -w /qanvas "$IMAGE" \
  sh -c 'python -c "import qiskit; print(\"Qiskit\", qiskit.__version__)" && python reference/generate.py'
