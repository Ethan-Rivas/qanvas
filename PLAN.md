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

**Status:** 0.1 is done. v0.1.0 was tagged on Oct 12, 2026, the website is live at https://ethan-rivas.github.io/qanvas/, and quantum-lab runs Qanvas as a service. Still open from `RELEASE.md`: the physics and Spanish reviews, a real install on Chrome and an iPhone, and a VoiceOver check.

## Version 0.2 plan

0.2 connects Qanvas to the rest of the lab: code goes both ways, and circuits too big for the browser run on Qiskit Aer. Everything that needs Python lives in quantum-lab; the website keeps working on its own, and the lab-only features appear only when Qanvas finds the lab.

**In:**

- **Editable OpenQASM tab:** type OpenQASM 2.0 and the circuit, results and code update after a short pause. The other three tabs stay read-only.
- **Import Quirk links:** paste a Quirk URL and get the same circuit, for the gates Qanvas has.
- **Open in notebook** (in quantum-lab): one button saves the circuit as a ready-to-run notebook in the lab's `notebooks/` folder and opens it in JupyterLab.
- **Run with Qiskit Aer** (in quantum-lab): run circuits with more qubits than the browser can, and get sampled counts.
- **Import Qiskit code** (in quantum-lab): paste Python that builds a `QuantumCircuit` and get the circuit.

**Out of 0.2:** noise models and mid-circuit measurement (0.3), and importing Cirq or pyQuil code.

**Technical design:**

- **The lab bridge:** a small Python web service in quantum-lab, `lab-bridge`, built from the lab's own image (Qiskit and Aer are already installed) and given the `notebooks/` folder. It answers three requests:
  - `POST /run` takes OpenQASM 2.0 and a shot count, runs it on Aer and returns counts.
  - `POST /notebook` takes a notebook Qanvas generated, saves it under `notebooks/qanvas/` and returns its path.
  - `POST /import/qiskit` runs the pasted Python in a separate process with a time limit and returns the circuit as OpenQASM, which Qanvas reads with its existing importer.
- **Same address, no CORS:** inside quantum-lab, Qanvas's nginx forwards `/api/` to the bridge, so the page only ever talks to its own address. The image turns that forwarding on only when an environment variable such as `QANVAS_BRIDGE_URL` is set, so the same image still works on its own and the website never sees it.
- **Discovery:** at start, Qanvas asks `./api/health`. If it answers, the lab-only buttons appear; on the website and in plain Docker they don't.
- **Bit order:** the bridge converts Qiskit's counts to Qanvas's order (q0 first) before replying, with a comment, and its tests check the conversion on circuits where the order matters.
- **Bigger circuits:** with the bridge, the qubit limit rises from 12 to an Aer limit to be decided (around 28). Above 12 qubits the browser stops simulating: Aer's sampled counts replace the exact histogram, and the amplitudes, Bloch spheres and step-through explanations aren't shown, with a note saying why.
- **Notebooks:** Qanvas builds the notebook itself from its Qiskit (or Cirq, or pyQuil) export, plus a cell that runs it and plots the results. The export tests already run that code; the bridge's tests also execute a generated notebook with nbconvert.
- **Quirk links:** Quirk's JSON format is read in the browser, mapping its gate names to Qanvas's and stopping with a clear message, as the OpenQASM importer does, at gates Qanvas lacks (such as anti-controls). Quirk's own bit order needs checking against Qanvas's, with a test.

**Milestones:**

1. **Code in:** the editable OpenQASM tab and Quirk link import, in Qanvas only.
   - **Check:** a circuit typed as OpenQASM or pasted from Quirk shows the same results as one built by hand, and invalid input never breaks the current circuit.
2. **The lab bridge:** the bridge service in quantum-lab, the nginx forwarding and discovery in Qanvas, and Open in notebook.
   - **Check:** in quantum-lab, Open in notebook creates a notebook that runs with Shift + Enter and gives the same results as Qanvas; on the website the button doesn't appear.
3. **Run with Qiskit Aer and import Qiskit code.**
   - **Check:** a circuit above 12 qubits runs on Aer with the bit order right, and Qiskit code from the lab's notebooks imports with the same final state.

**Open questions for 0.2:**

- [ ] The qubit limit with Aer, and how the editor should look with that many wires.
- [ ] Whether importing Qiskit code should also work on the website, with a browser-side reader for simple code like `qc.h(0)`, or only in quantum-lab, where real Python runs it.
- [ ] What the 0.1 reviews and feedback from students change about this list.

## After 0.1, and open questions

**Later versions, roughly in order:**

- **0.2:** see the 0.2 plan above.
- **0.3:** noise models (depolarizing, readout error) with a side-by-side ideal vs noisy view; mid-circuit measurement.
- **0.4:** custom gates and subcircuits; lesson paths that chain several examples.
- **Later:** run on real IBM hardware through quantum-lab; a native desktop app if the installable web app isn't enough; collaboration.

**Open questions:**

- [ ] Final color palette (D's green is a placeholder).
- [ ] Logo and a short tagline.
- [ ] Domain name (for example qanvas.app or qanvas.dev), and whether the GitHub Pages site is enough at first.
- [ ] Who reviews the explanations for accuracy, especially the Spanish ones: a professor or classmates from the master's program?
- [ ] Which examples matter most for the course, to ship first in the gallery.
