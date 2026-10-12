# Qanvas

A friendly visual quantum circuit builder that runs in the browser, for students first and researchers second. Work in progress: see [PLAN.md](PLAN.md).

## Development

```bash
npm install
npm run dev        # start the app
npm test           # unit tests and the Qiskit reference tests
npm run typecheck
```

## Correctness

The simulator is checked against Qiskit: every amplitude must match within 1e-9.

- `reference/generate.py` builds the test circuits in Qiskit (every gate on each qubit position, the gallery examples in `src/examples/circuits.json`, and 200 seeded random circuits) and saves their exact final states in `reference/data/`.
- Regenerate them with `npm run reference`, which runs the script in the [quantum-lab](https://github.com/Ethan-Rivas/quantum-lab) image. Set `QUANTUM_LAB_IMAGE=quantum-lab:local` to use a local build. Never edit the reference files by hand.
- Qanvas writes kets with q0 first (leftmost); Qiskit writes q0 last. The script converts to Qanvas's order before saving.

## License

MIT
