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

- **Editable OpenQASM tab:** type OpenQASM 2.0 and the circuit, results and code update after a short pause. On the website and in plain Docker the other three tabs stay read-only, with a note at the bottom that they can be edited in quantum-lab.
- **Import Quirk links:** paste a Quirk or Quirk-E link and get the same circuit, when it only uses gates Qanvas has. Otherwise nothing changes and a message lists what's missing; a gate is never silently dropped.
- **Download as:** save the circuit as a ready-to-run notebook (`.ipynb`), a Python script (`.py`) or OpenQASM (`.qasm`), in Qiskit, Cirq or pyQuil. Works on the website too.
- **Open in notebook** (in quantum-lab): the same notebook, saved straight into the lab's `notebooks/` folder and opened in JupyterLab.
- **Run with Qiskit Aer** (in quantum-lab): run circuits with more qubits than the browser can, and get sampled counts.
- **Edit Qiskit, Cirq and pyQuil code** (in quantum-lab): the three Python tabs become editable. Real Python runs the code, so loops, variables and functions work, and the diagram shows the circuit the code builds. The code you typed stays as you wrote it until you change the diagram, which rewrites it as Qanvas's flat version, with a note saying so first.

**Out of 0.2:** noise models and mid-circuit measurement (0.3), importing whole notebooks (0.5), and reading Python code on the website (it needs Python to run, so it lives in the lab).

**Technical design:**

- **The lab bridge:** a small Python web service in quantum-lab, `lab-bridge`, built from the lab's own image (Qiskit and Aer are already installed) and given the `notebooks/` folder. It answers three requests:
  - `POST /run` takes OpenQASM 2.0 and a shot count, runs it on Aer and returns counts.
  - `POST /notebook` takes a notebook Qanvas generated, saves it under `notebooks/qanvas/` and returns its path.
  - `POST /import` takes Qiskit, Cirq or pyQuil code, runs it in a separate process with a time limit and returns the circuit it builds as OpenQASM, which Qanvas reads with its existing importer. Qiskit and Cirq write OpenQASM themselves; for pyQuil the bridge converts the program's instructions, which is short for the gates Qanvas has. Code that times out or fails returns its error, and the current circuit stays.
- **Same address, no CORS:** inside quantum-lab, Qanvas's nginx forwards `/api/` to the bridge, so the page only ever talks to its own address. The image turns that forwarding on only when an environment variable such as `QANVAS_BRIDGE_URL` is set, so the same image still works on its own and the website never sees it.
- **Discovery:** at start, Qanvas asks `./api/health`. If it answers, the lab-only buttons appear; on the website and in plain Docker they don't.
- **Bit order:** the bridge converts Qiskit's counts to Qanvas's order (q0 first) before replying, with a comment, and its tests check the conversion on circuits where the order matters.
- **Bigger circuits:** with the bridge, the qubit limit rises from 12 to 24. Aer's state for 24 qubits takes 256 MB, which fits Docker Desktop's default memory; 28 would need 4 GB. Above 12 qubits the browser stops simulating: Aer's sampled counts replace the exact histogram, and the amplitudes, Bloch spheres and step-through explanations aren't shown, with a note saying why.
- **Notebooks:** Qanvas builds the notebook in the browser from its Qiskit, Cirq or pyQuil export: a title, the bit-order note for Qiskit, the circuit, and a cell that runs it and plots the results. Download as and Open in notebook use the same file. The export tests run every generated notebook and script in the quantum-lab image (notebooks with nbconvert) and check that their results agree with Qanvas's.
- **Quirk links:** Quirk's JSON format is read in the browser, mapping its gate names to Qanvas's and stopping with a clear message, as the OpenQASM importer does, at gates Qanvas lacks (such as anti-controls). Display cells (Bloch, Chance, Amps, Density) don't change the state and are skipped. Quirk-E's link format needs checking against Quirk's, and Quirk's bit order against Qanvas's, with a test.

**Milestones:**

1. **Code in and out:** the editable OpenQASM tab with the note under the Python tabs, Quirk link import and Download as, in Qanvas only.
   - **Check:** a circuit typed as OpenQASM or pasted from Quirk shows the same results as one built by hand, invalid input never breaks the current circuit, and every downloaded notebook and script runs in the quantum-lab image with results that agree with Qanvas.
2. **The lab bridge:** the bridge service in quantum-lab, the nginx forwarding and discovery in Qanvas, and Open in notebook.
   - **Check:** in quantum-lab, Open in notebook creates a notebook that runs with Shift + Enter and gives the same results as Qanvas; on the website the button doesn't appear.
3. **Run with Qiskit Aer, and edit Qiskit, Cirq and pyQuil code in the lab.**
   - **Check:** a circuit above 12 qubits runs on Aer with the bit order right; in each language, a snippet with a loop shows the right circuit with the same final state, and the code stays as typed.

**Status:** 0.2 is done and released as v0.2.1 on Oct 12, 2026, together with quantum-lab v0.3.0, which runs the lab bridge. The v0.2.0 tag published only the website: its server image couldn't be built for arm64, so 0.2.1 is the release. Still open: the reviews and checks listed under 0.1, and a test of the bridge in Codespaces.

**Open questions for 0.2:**

- [x] The qubit limit with Aer is 24 for now (decided Oct 12, 2026). Rows get more compact above 12 qubits so the circuit stays readable.
- [x] Editing Qiskit, Cirq and pyQuil code works only in quantum-lab, where real Python runs it, so any code that runs in a notebook works, loops included. The website keeps those tabs read-only and points to the lab; it doesn't get a partial Python reader. (Decided Oct 12, 2026.)
- [ ] What the 0.1 reviews and feedback from students change about this list.

## Version 0.3 plan

0.3 makes measurement and noise part of the circuit. A measurement can happen anywhere and later gates can depend on its result, and noise shows how real hardware spoils a clean result. Everything stays exact: Qanvas computes the mixture of every possible outcome instead of sampling runs, so it still matches Qiskit within 1e-9.

**In:**

- **Noise panel:** three sliders for the whole circuit: depolarizing error per one-qubit gate, depolarizing error per two-qubit gate, and readout error (the chance a measurement reports the wrong bit). Noise is off by default and is saved with the circuit, in share links and files too.
- **Ideal vs noisy:** with noise on, the histogram shows both results side by side. Step-through and the Bloch spheres show the noisy state, so the arrows shrink as it loses coherence, and Learn mode says why.
- **Measure anywhere:** M can go in any column, and a measured qubit can be used again afterwards.
- **Reset:** a new gate that puts a qubit back to |0⟩.
- **One-bit conditions:** a one-qubit gate can run only "if qN measured 1" (or 0), where qN was measured in an earlier column. The diagram draws a double line from the measurement to the gate.
- **Examples:** teleportation rebuilt with real measurements and corrections, a 3-qubit bit-flip error-correction demo, and "noise ruins a Bell state".
- **Export:** Qiskit and Cirq export everything, noise included. pyQuil exports measurements and conditions but not the noise. OpenQASM 2.0 exports measurements, reset and `if` (one classical register per qubit) but not the noise. When noise is left out, a comment at the top says so.
- **In quantum-lab:** noisy or mid-measurement circuits above 8 qubits run on Qiskit Aer with the same noise and give sampled counts.

**Out of 0.3:** noise placed as gates on a wire; hardware-like noise (relaxation, T1 and T2, error rates per gate); conditions on several bits; a view that follows one measurement outcome; and user-editable qubit limits (see Later).

**Technical design:**

- **Circuit model:** an operation gains an optional `condition: {qubit, value}`, there's a new `RESET` gate, and the circuit gains an optional `noise: {oneQubit, twoQubit, readout}`. Validation drops the "measure only at the end" rule. A condition must point at a qubit measured in an earlier column and not touched since. All new fields are optional, so old links and files still open.
- **Two engines:** a circuit with no noise, no reset and no measurement before the end keeps today's state-vector simulator (exact, up to 12 qubits). Anything else uses a new density-matrix simulator, which tracks the mixture of every outcome as a matrix:
  - a gate is ρ → UρU†;
  - depolarizing noise is a channel applied after each gate;
  - a measurement removes the coherence between the qubit's 0 and 1 (Z-basis dephasing) and records the outcome probabilities;
  - a conditional gate applies only to the matching outcome, and readout error mixes in the other outcome with probability p.
- **Size:** a density matrix grows as 4ⁿ, so the density-matrix simulator is limited to 8 qubits in the browser (1 MB per snapshot; 12 qubits would be 256 MB). Above that, the lab runs the circuit on Aer.
- **Same results shape:** probabilities, Bloch vectors (from the same partial trace) and per-column snapshots keep their current form, so the interface reads both engines the same way. The noisy histogram applies readout error to the final probabilities. Both run in the Web Worker. The performance check adds an 8-qubit noisy circuit that must also update in under 100 ms.
- **Readout error and conditions:** the readout slider applies to every measurement, mid-circuit ones included, so a condition can fire on a wrong reading. This matches Qiskit Aer's `ReadoutError`. Flag for the physics review.
- **Exact references:** the reference script adds circuits computed with Qiskit's `DensityMatrix`:
  - noise as `depolarizing_error` channels;
  - a mid-circuit measurement plus a condition as the equivalent controlled gate on a dephased qubit (the deferred-measurement principle);
  - readout error as a classical mix of outcomes.
  These are exact, so the 1e-9 tolerance stays.
- **Export tests:** exported Qiskit and Cirq code runs with noise in the quantum-lab image. Noisy runs can only be sampled, so their counts must agree with Qanvas's exact probabilities within a statistical bound (fixed seed, enough shots). pyQuil and OpenQASM are checked on the ideal circuit, as today.
- **Bit order:** nothing changes inside Qanvas. The Qiskit exporter and the reference script convert as they do today, with a comment wherever a classical register is involved.
- **Lab bridge:** `POST /run` takes the noise settings along with the OpenQASM and builds the same `NoiseModel` the Qiskit exporter writes.

**Milestones:**

1. **Measure anywhere:** the model changes, the density-matrix simulator without noise, reset, one-bit conditions with their double line on the diagram, and export to all four formats.
   - **Check:** real teleportation matches Qiskit within 1e-9 for every input angle tested, the exported code runs in the quantum-lab image and agrees with Qanvas, and old share links still open.
2. **Noise:** the noise panel, the depolarizing and readout channels, ideal vs noisy histograms, shrinking Bloch arrows in step-through, noise in share links, Qiskit and Cirq noise export, and noise in the lab's `/run`.
   - **Check:** density-matrix references match within 1e-9, exported Qiskit and Cirq noisy counts agree within the statistical bound, and an 8-qubit noisy circuit updates in under 100 ms.
3. **Learn and ship:** explanations in EN and ES (measuring mid-circuit, mixed states, noise), the three new examples, accessibility, and the release.
   - **Check:** the release checklist passes; tag v0.3.0.

**Open questions for 0.3:**

- [x] Density-matrix references are allowed alongside `Statevector` ones, still generated by the script, with the same 1e-9 tolerance (decided Oct 13, 2026).
- [ ] Who reviews the physics of mixed states, noise and "the measurement happened but we haven't looked yet", in both languages. Strings to review: `learn.RESET.body`, `learn.measuredMix`, `bloch.hintMixed`, `results.noAmplitudes`, `results.densityLimit` (reworded), `noise.oneQubitHelp`, `noise.twoQubitHelp`, `noise.readoutHelp`, `code.cirqNoise` and `results.readout`, `learn.chances`, `learn.chancesCertain`, `learn.readoutNoise`, `learn.gateNoise`, `learn.noiseMix`, `learn.mixed` and the reworded `learn.M.body` (which settles the "just before measuring" reconciliation), plus the descriptions and challenges of `teleportation`, `bit-flip-code` and `noisy-bell` (EN and ES), whether "leaves its qubit in a random state" is the right plain wording for a depolarizing error, and one term for a mixed state across `learn.mixed` ("a mixed state"), `learn.RESET.body` and `results.noAmplitudes` ("a mix of outcomes").
- [x] Slider ranges: 0 to 10% for gate errors and 0 to 20% for readout, in steps of 0.1%, with noise off by default (decided Oct 13, 2026).
- [x] The noise panel opens from a "Noise" button in the circuit toolbar, next to "+ Add qubit", and the summary line says "noise on" (decided Oct 13, 2026).
- [x] The lab's `/run` gets the noise only when quantum-lab advertises a `noise` feature; the bridge change is specified for a separate quantum-lab session, since this repo doesn't modify quantum-lab (decided Oct 13, 2026).
- [x] Whether Learn mode shows each measurement's outcome probabilities at that step: yes, the step card says each measured qubit's chances of reading 0 and 1, readout errors included (decided Oct 13, 2026).
- [x] The Teleportation example is replaced by the real version, with the same id (decided Oct 13, 2026).

**Known gaps after milestone 2:**

- The lab's `/run` gets noise and the counted qubits from Qanvas only once quantum-lab ships `docs/superpowers/specs/2026-10-13-lab-run-noise.md`. Until then, circuits that are noisy, measure partway through or reset show the size note above the browser limit.
- Editing the Cirq code of a noisy circuit in quantum-lab fails until the bridge's `/import` skips noise channels (same spec, item 5).
- Noise rates written in edited Qiskit or Cirq code don't change the circuit's noise; set them in the noise panel.

## After 0.1, and open questions

**Later versions, roughly in order:**

- **0.1.x:** fixes from the physics and Spanish reviews and from student feedback, as small patch releases.
- **0.2:** see the 0.2 plan above.
- **0.3:** see the 0.3 plan above.
- **0.4:** a gate toolkit and lessons. Qanvas isn't meant to be a Quirk clone: it takes the gates that help someone learn or export working code, and leaves out Quirk's sandbox tools (arithmetic and input registers, time-animated gates, gradients, parity and sampling probes, postselection), which are hard to explain step by step and don't turn into clean framework code.
  - Any gate with controls, more than two controls, and controls that fire on 0.
  - √X, √Y and powers such as X^t.
  - QFT and QFT† as one block.
  - Custom gates from part of a circuit (subcircuits) or from a matrix checked to be unitary. OpenQASM 2.0 can't express a matrix gate, so that export says so.
  - Lesson paths that chain several examples.
  - **Check:** a 5-qubit Grover search with an oracle subcircuit and many-control gates, as Quirk's gallery shows it, is built in Qanvas, exported, and matches Qiskit. Each new gate also lets more Quirk links import.
- **0.5:** import real notebooks. In quantum-lab, a Qiskit notebook runs in a separate process with a time limit and a warning first (it runs the notebook's own code), and you pick one of the circuits it builds. Qiskit rewrites gates Qanvas lacks into ones it has; more than 24 qubits or unbound parameters get a clear message. Circuits with hundreds of steps get a compact view, a slider that still works and a performance check at that size. It comes after 0.3 and 0.4 because real notebooks often use mid-circuit measurement, and long rewritten circuits need subcircuits to stay readable.
- **Later:** run on real IBM hardware through quantum-lab; a native desktop app if the installable web app isn't enough; collaboration; qubit limits each user can change in settings (12 for the browser's state vector, 8 for its density matrix, 24 for Aer), with a warning that higher limits can be slow or run out of memory.

**Open questions:**

- [ ] Final color palette (D's green is a placeholder).
- [ ] Logo and a short tagline.
- [ ] Domain name (for example qanvas.app or qanvas.dev), and whether the GitHub Pages site is enough at first.
- [ ] Who reviews the explanations for accuracy, especially the Spanish ones: a professor or classmates from the master's program?
- [ ] Which examples matter most for the course, to ship first in the gallery.
