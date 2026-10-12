# Qanvas · Plan

Oct 11, 2026 · Ethan Rivas

Source: the "Qanvas · Plan" doc in claude.ai. This file is the build brief for Claude Code; keep it in sync if the plan changes.

## Why Qanvas

Qanvas is a modern, friendly visual quantum circuit builder that runs in the browser, aimed at students first and researchers second.

- **The problem:** the visual tools students meet first look and feel dated. Quirk, the best-known one, has had no code changes since 2021. Quirk-E, its maintained fork, adds code export but keeps the 2016 interface. IBM Quantum Composer is polished but cloud-only and needs an account.
- **Who it's for:** students learning the basics (first), and researchers who want to sketch a small circuit and get working code (second).
- **What makes it different:**
  - Learning built in: step through a circuit and see a plain-language explanation of each step, right where it happens.
  - Live code in Qiskit, Cirq, pyQuil and OpenQASM, with the line for the current step highlighted.
  - A calm, modern interface, in English and Spanish.
  - Works offline, with no account, and connects to quantum-lab for heavier simulation.
- **Where it lives:** its own open-source repository (MIT), also bundled into [quantum-lab](https://github.com/Ethan-Rivas/quantum-lab) as a service and published as a free website on GitHub Pages.

## Decisions so far

The direction is settled except for colors. Concept D is the visual reference: see `design/concept-d.html` in this repo.

| Topic | Decision |
| --- | --- |
| Name | Qanvas |
| Audience | Students first, researchers second |
| Layout | Concept D: gates left, circuit center with step-through, code below, results right |
| Learn mode | On by default: explanation callout at the current step, friendly gate names, "Try this" challenges; off gives a cleaner expert view |
| Languages | English and Spanish from the first version |
| Platform | Browser app with its own simulator; offline; installable as an app |
| quantum-lab link | Optional "Run with Qiskit Aer" and "Open in notebook" when running inside quantum-lab |
| Repository | Separate repo (`Ethan-Rivas/qanvas`), MIT license, bundled into quantum-lab |
| Colors | Not decided. D's green is a placeholder; all colors live in tokens so the palette can change late |
| Style | Clean and calm, like a modern design tool |

## Version 0.1 scope

Version 0.1 does the core job well: build a circuit up to 12 qubits by dragging gates, see the results update live, step through it with explanations, and copy working code.

**In:**

- **Gates:** H, X, Y, Z, S, S†, T, T†, Rx, Ry, Rz (with an angle), P(θ), CNOT, CZ, SWAP, Toffoli (CCX), measurement.
- **Editing:** drag from the palette, move, delete, copy, undo and redo, add and remove qubits, keyboard shortcuts.
- **Live results:** probability histogram, amplitude table, one Bloch sphere per qubit (showing the shrinking arrow when a qubit is entangled).
- **Step-through:** a slider that shows the state after each column, with future steps faded.
- **Learn mode:** a callout at the current step (what the gate did, before and after), friendly gate names, and a "Try this" challenge per example.
- **Code panel:** Qiskit, Cirq, pyQuil and OpenQASM 2.0, kept in sync with the circuit, current line highlighted, one-click copy.
- **Import:** OpenQASM 2.0.
- **Examples gallery:** Bell state, GHZ, superdense coding, quantum teleportation, Deutsch–Jozsa, Grover (2 qubits).
- **Sharing:** the circuit encoded in the URL; save and load a file.
- **Languages:** English and Spanish for every interface string and explanation.
- **Offline and installable:** works without internet and can be installed as an app.

**Out of 0.1, on purpose:**

- Noise simulation and real hardware runs.
- Mid-circuit measurement and classical control (if/else on results).
- Custom gates and subcircuits.
- Accounts, cloud saving and collaboration.
- Import from Qiskit or Quirk links (planned for 0.2).
- More than 12 qubits in the browser (the quantum-lab connection covers larger circuits later).

## Technical design

Qanvas is a static TypeScript web app built around one circuit model: the simulator, the code panel and the explanations all read from it, so they can never disagree.

**Architecture** (the plan doc draws this as a diagram):

- **Browser app (works offline):**
  - **Interface** (React: drag, step, explain) sends **edits** to the circuit model.
  - **Circuit model** (one JSON source of truth) is the center of everything.
  - **Simulator** (state vector, Web Worker) **runs each step** of the model and sends results back to the interface.
  - **Code generators** turn the model into Qiskit, Cirq, pyQuil and OpenQASM.
  - **Learn content** (explanations in EN and ES) feeds the interface.
  - **Share and save** (URL, file, offline cache) reads and writes the model.
- **quantum-lab (optional, version 0.2+):** a **Qiskit Aer service** that receives OpenQASM from the code generators and runs big circuits.

| Part | Choice | Why |
| --- | --- | --- |
| Language and UI | TypeScript, React, Vite | Widely known, fast to develop, builds to static files |
| App state | Zustand store with undo history | Small and simple; the circuit model plus edit history |
| Drag and drop | dnd-kit | Works with mouse, touch and keyboard |
| Simulator | Own state-vector engine in TypeScript, in a Web Worker | No dependencies; the interface never freezes while it computes |
| Code export and import | One generator per framework; OpenQASM 2.0 as the exchange format | Every framework reads OpenQASM, so import and export share one path |
| Languages | One message file per language (EN, ES), explanations included | Adding a language later means adding one file |
| Offline and install | Service worker (progressive web app) | Works without internet; installs with its own window and icon |
| Hosting | GitHub Pages, plus a small web-server image for quantum-lab | Free website for anyone; one more service in docker compose |

**Circuit model.** A circuit is a list of columns; each column holds the operations that run at the same time:

```json
{"qubits": 3, "columns": [
  [{"gate": "H", "targets": [0]}],
  [{"gate": "X", "controls": [0], "targets": [1]}],
  [{"gate": "X", "controls": [1], "targets": [2]}],
  [{"gate": "M", "targets": [0, 1, 2]}]
]}
```

**Simulator details.**

- 12 qubits = 4,096 amplitudes = 64 KB per state, so a snapshot after every column is cheap and makes stepping instant.
- Each qubit's Bloch arrow comes from its reduced state (a partial trace): length 1 means a pure state, shorter means it is entangled with others.
- **Bit order needs care:** Qanvas shows q0 first (left), while Qiskit prints results with q0 last (right). The Qiskit exporter and the tests must convert, or results will look reversed.

**Qiskit Aer bridge (0.2 or later).** quantum-lab gets a small Python service that receives OpenQASM, runs it with Qiskit Aer and returns the results. Qanvas shows "Run with Qiskit Aer" only when it finds that service.

## Testing and correctness

Every result Qanvas shows is checked against Qiskit automatically, so students and researchers can trust it.

- **Reference answers from Qiskit:** a Python script in the repo builds every test circuit in Qiskit, computes the exact final state with `Statevector`, and saves the amplitudes as reference files. GitHub Actions regenerates them, using the quantum-lab image, whenever the test circuits change.
- **Simulator tests:** Qanvas runs the same circuits and must match every amplitude within 1e-9.
- **What the test circuits cover:**
  - every gate on its own, on each qubit position, including controls above and below the target;
  - every example in the gallery;
  - 200 random circuits from 1 to 12 qubits, generated with a fixed seed so failures can be reproduced.
- **Exporter tests:** the Qiskit, Cirq and pyQuil code Qanvas generates is actually run in Python, and its results must match Qanvas's own. This is what catches bit-order mistakes.
- **Interface tests:** browser tests (Playwright) for the main flows: drag a gate, step through, switch language, copy code, share a link.
- **Performance check:** a 12-qubit circuit with 50 columns must update in under 100 ms on a mid-range laptop, measured in CI.
- **Accessibility check:** automated checks on every screen, plus full keyboard use (drag and drop included).

## Design system

Every color in the code goes through a named token, so the final palette can be swapped in one file, and a dark theme added, without touching any screen.

| Token | Used for | Placeholder (concept D) |
| --- | --- | --- |
| `brand` | Logo, primary buttons, Learn mode switch, step slider | #0F7B6C |
| `brand-soft` | Explanation callout, current step column, highlighted code line | #E8F4F1 |
| `quantum-data` | Probability bars, Bloch arrows | #0F7B6C |
| `measure` | Measurement gates, "Try this" challenges | #E2A75A |
| `ink` / `ink-muted` | Text, secondary text | #1D1F1E / #5E615E |
| `surface` / `ground` / `border` | Panels, background, dividers | #FFFFFF / #FAF8F4 / #E8E4DC |
| `gate-*` | One color per gate family (below) | concept D values |

- **Gate families:** Hadamard, Pauli (X, Y, Z), phase (S, T, P), rotations (Rx, Ry, Rz), multi-qubit (CNOT, CZ, SWAP, Toffoli) and measurement each get one color. Families must also differ in lightness, not hue alone, for color-blind users.
- **Type:** Figtree for the interface, DM Mono for gates, kets and code, as in concept D.
- **Accessibility:** text contrast of at least 4.5:1, touch targets of at least 44 px, every action reachable by keyboard, and a screen-reader description of the circuit and its results.
- **Open:** the final palette (see the open questions).

## Milestones

Version 0.1 is built in four milestones; each ends with a check that must pass before the next one starts, so the hardest part, a correct simulator, is proven first. The phases are in order; no dates yet.

1. **Foundations:** repo and circuit model, state-vector simulator, Qiskit reference tests.
   - **Check:** the simulator matches Qiskit on every test circuit.
2. **Editor:** gate palette, drag and drop, undo, live histogram.
   - **Check:** a GHZ state can be built by hand and the results update live.
3. **Learn and code:** step-through, Bloch spheres, explanations in EN and ES, code panel in 4 formats.
   - **Check:** the exported Qiskit, Cirq and pyQuil code runs and its results match Qanvas.
4. **Ship 0.1:** examples gallery, sharing, OpenQASM import, offline install, accessibility, website, quantum-lab service.
   - **Check:** the release checklist passes; tag v0.1.0.

**How to work through them:** one milestone at a time, stopping at each check for review with the app running locally. Create the GitHub repository (`Ethan-Rivas/qanvas`) after milestone 1, once the simulator passes its tests. After milestone 4, add Qanvas to quantum-lab as a service and update quantum-lab's roadmap to point to it.

## After 0.1, and open questions

**Later versions, roughly in order:**

- **0.2:** Qiskit Aer bridge in quantum-lab; import from Qiskit code and Quirk links; "Open in notebook" that drops the circuit into JupyterLab.
- **0.3:** noise models (depolarizing, readout error) with a side-by-side ideal vs noisy view; mid-circuit measurement.
- **0.4:** custom gates and subcircuits; lesson paths that chain several examples.
- **Later:** run on real IBM hardware through quantum-lab; a native desktop app if the installable web app isn't enough; collaboration.

**Open questions:**

- [ ] Final color palette (D's green is a placeholder).
- [ ] Logo and a short tagline.
- [ ] Domain name (for example qanvas.app or qanvas.dev), and whether the GitHub Pages site is enough at first.
- [ ] Who reviews the explanations for accuracy, especially the Spanish ones: a professor or classmates from the master's program?
- [ ] Which examples matter most for the course, to ship first in the gallery.
