# Qanvas · project rules

Qanvas is a browser-based visual quantum circuit builder for students first and researchers second. `PLAN.md` is the brief: read it before starting any work, and follow its scope, technical design and milestones.

## How we work

- Build one milestone at a time, in the order in `PLAN.md`. When a milestone's check passes, stop and summarize what was built and how to try it, then wait for review before starting the next one.
- Stay inside the version 0.1 scope. If something outside it seems necessary, ask first.
- Prefer small, focused commits, one per feature or fix, with a short imperative message (for example, "Add CNOT and CZ to the simulator").

## Git

- Commit as `Ethan-Rivas <ethan-rivas@hotmail.com>`. Set it in this repo's git config if it isn't set.
- Never add co-author lines, "Generated with" lines, session links or any other attribution to commits or pull requests.
- Never rewrite history that has been pushed.

## Correctness (non-negotiable)

- The simulator must match Qiskit within 1e-9 on every reference circuit. Never change the simulator without running these tests, and never loosen the tolerance or edit a reference file to make a test pass.
- Reference states come from Qiskit's `Statevector` via the script in the repo. Regenerate them with that script; never write them by hand.
- **Bit order:** Qanvas displays q0 first (leftmost), like Cirq and Quirk. Qiskit prints bitstrings with q0 last (rightmost). Every place that talks to Qiskit (exporter, reference script, tests) must convert explicitly, with a comment saying so.
- Exported Qiskit, Cirq and pyQuil code must actually be run in tests, not just compared as text.

## Design

- The visual reference is concept D: `design/concept-d.html` (open it in a browser). Match its layout, spacing, type and component style.
- Colors only through design tokens (CSS custom properties defined in one file). No hex values anywhere else. The final palette isn't decided; concept D's green is a placeholder.
- Fonts: Figtree for the interface, DM Mono for gates, kets and code.
- Accessibility is part of "done": text contrast of at least 4.5:1, touch targets of at least 44 px, everything usable by keyboard (drag and drop included), real `<button>` and `<label>` elements.

## Content

- Every interface string and explanation exists in English and Spanish, in the message files. No hard-coded text in components.
- Explanations are for students: plain language, short sentences, accurate physics. When unsure about a physics statement, flag it for review rather than guess.
- Spanish is natural Mexican Spanish using "tú", not a word-for-word translation.

## Related project

- quantum-lab (`~/Downloads/quantum-lab`, `github.com/Ethan-Rivas/quantum-lab`) provides Qiskit, Cirq and pyQuil in Docker. Use its image to run the Python reference script and the exporter tests. Don't modify quantum-lab from this repo.
