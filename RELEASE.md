# Release checklist

Copy this list into the release's tracking issue and tick each item. A release is tagged only when every item passes.

## Automated (CI on `main` must be green)

- [ ] **Types and unit tests:** `npm run typecheck` and `npm test`, including every Qiskit reference circuit within 1e-9 and the 12-qubit, 50-column performance check.
- [ ] **Qiskit references:** the "Qiskit references" workflow regenerates the reference states with the quantum-lab image and the simulator still matches them.
- [ ] **Exported code:** `npm run test:export` runs the Qiskit, Cirq, pyQuil and OpenQASM code for every reference circuit and imports Qiskit's own OpenQASM; all final states match within 1e-9.
- [ ] **Browser tests:** `npm run test:e2e`, covering dragging, keyboard-only drag and drop, step-through, code copy, examples, share links, OpenQASM import, offline use, phone width, Spanish and automated accessibility checks on the main screen and every dialog.
- [ ] **Server image:** the `server-image` CI job builds the `Dockerfile`.

## By hand

- [ ] **Examples:** each of the eight loads, its description is accurate, and the answer to its "Try this" matches what Qanvas shows.
- [ ] **Noise:** open the noise panel by keyboard, move each slider, check the dashed "without noise" bars and the shrinking Bloch arrows, and that a share link keeps the noise.
- [ ] **Sharing:** a copied link opens the same circuit in a private window; a downloaded file opens again through Open.
- [ ] **Install and offline:** install the app from Chrome (and add it to the Home Screen on an iPhone), turn the network off, and build a circuit.
- [ ] **Keyboard only:** build a Bell state, step through it, switch the code tab, copy the code, and open and close every dialog without a mouse.
- [ ] **Screen reader:** with VoiceOver, check the circuit summary, the gate buttons, the step slider and the results.
- [ ] **Spanish:** every screen in Spanish; the wording reviewed by a native speaker.
- [ ] **Physics:** the step explanations (`learn.*`), example descriptions and "Try this" challenges reviewed for accuracy, in both languages, and the 0.3 strings listed under PLAN.md's open questions.
- [ ] **Layouts:** phone (390 px), tablet and desktop, and at 200% zoom.

## Publishing

- [ ] `version` in `package.json` matches the release.
- [ ] The repository is public and GitHub Pages is on (Settings → Pages → Source: GitHub Actions).
- [ ] Tag the release (`git tag v0.1.0 && git push origin v0.1.0`); the "Website" and "Server image" workflows succeed.
- [ ] The `qanvas` package on GitHub Container Registry is public.
- [ ] The website loads at https://ethan-rivas.github.io/qanvas/, can be installed and works offline.
- [ ] quantum-lab gets the changes in [docs/quantum-lab.md](docs/quantum-lab.md), in its own repository, with [docs/superpowers/specs/2026-10-13-lab-run-noise.md](docs/superpowers/specs/2026-10-13-lab-run-noise.md).
