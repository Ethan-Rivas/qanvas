# Qanvas

A friendly visual quantum circuit builder that runs in the browser, for students first and researchers second. Work in progress: see [PLAN.md](PLAN.md).

## Development

```bash
npm install
npm run dev        # start the app
npm test           # unit tests and the Qiskit reference tests
npm run test:e2e   # browser tests (Playwright)
npm run test:export  # runs the exported code in the quantum-lab image (needs Docker)
npm run typecheck
```

## Running it

- **Website:** each release tag publishes the app to GitHub Pages (`.github/workflows/pages.yml`).
- **Offline and installable:** after the first visit Qanvas works without internet, and the browser can install it as an app.
- **In quantum-lab:** the `Dockerfile` builds a small web server (published as `ghcr.io/ethan-rivas/qanvas`); see [docs/quantum-lab.md](docs/quantum-lab.md).
- **Icons:** `npm run icons` renders `public/icons` from the design tokens after a brand color change.

## Correctness

The simulator is checked against Qiskit: every amplitude must match within 1e-9.

- `reference/generate.py` builds the test circuits in Qiskit (every gate on each qubit position, the gallery examples in `src/examples/circuits.json`, and 200 seeded random circuits) and saves their exact final states in `reference/data/`.
- Regenerate them with `npm run reference`, which runs the script in the [quantum-lab](https://github.com/Ethan-Rivas/quantum-lab) image. Set `QUANTUM_LAB_IMAGE=quantum-lab:local` to use a local build. Never edit the reference files by hand.
- Qanvas writes kets with q0 first (leftmost); Qiskit writes q0 last. The script converts to Qanvas's order before saving.
- The exported Qiskit, Cirq, pyQuil and OpenQASM code is run for every reference circuit by `scripts/run_exports.py`, and each final state must match Qanvas's within 1e-9.

## License

MIT
