import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function drag(page: Page, from: Locator, to: Locator) {
  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2, { steps: 3 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 });
  await page.mouse.up();
}

const cell = (page: Page, column: number, qubit: number) => page.locator(`.cell[data-column="${column}"][data-qubit="${qubit}"]`);

const paletteGate = (page: Page, name: RegExp) => page.getByRole('complementary', { name: 'Gates' }).getByRole('button', { name });

const outcome = (page: Page, text: string) => page.locator('.results .visually-hidden', { hasText: text });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('qanvas.language', 'en'));
  await page.goto('/');
});

test('builds a GHZ state by dragging gates and updates the results live', async ({ page }) => {
  await drag(page, paletteGate(page, /Hadamard/), cell(page, 0, 0));
  await expect(outcome(page, '|000⟩: 50%')).toBeVisible();
  await expect(outcome(page, '|100⟩: 50%')).toBeVisible();

  await drag(page, paletteGate(page, /^CNOT/), cell(page, 1, 0));
  await drag(page, paletteGate(page, /^CNOT/), cell(page, 2, 1));

  await expect(page.getByText('3 qubits · 3 steps')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Circuit summary' }).getByRole('listitem')).toHaveText([
    'Step 1: Hadamard on q0.',
    'Step 2: CNOT, control q0, target q1.',
    'Step 3: CNOT, control q1, target q2.',
  ]);
  await expect(outcome(page, '|000⟩: 50%')).toBeVisible();
  await expect(outcome(page, '|111⟩: 50%')).toBeVisible();
  await expect(outcome(page, '|110⟩: 0%')).toBeVisible();

  await page.keyboard.press('ControlOrMeta+z');
  await expect(outcome(page, '|110⟩: 50%')).toBeVisible();

  await page.getByRole('button', { name: 'Hadamard on q0, step 1' }).click();
  await page.keyboard.press('ControlOrMeta+c');
  await page.keyboard.press('ControlOrMeta+v');
  await expect(page.getByRole('button', { name: 'Hadamard on q0, step 2' })).toBeFocused();
  await expect(outcome(page, '|000⟩: 100%')).toBeVisible();
});

test('builds a Bell state with the keyboard only', async ({ page }) => {
  const live = page.locator('[id^="DndLiveRegion"]');
  async function press(key: string, announcement: string) {
    await page.keyboard.press(key);
    await expect(live).toHaveText(announcement);
    // dnd-kit measures the drop cells in the frames after a pick-up; people never type that fast.
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  }

  await paletteGate(page, /Hadamard/).focus();
  await press('Space', 'Picked up Hadamard.');
  await press('ArrowRight', 'Hadamard is over q0, step 1.');
  await press('Space', 'Hadamard placed on q0, step 1.');
  await expect(page.getByRole('button', { name: 'Hadamard on q0, step 1' })).toBeFocused();

  await paletteGate(page, /^CNOT/).focus();
  await press('Space', 'Picked up CNOT.');
  await press('ArrowRight', 'CNOT is over q0, step 1.');
  await press('ArrowRight', 'CNOT is over q0, step 2.');
  await press('Space', 'CNOT placed on q0, step 2.');
  await expect(page.getByRole('button', { name: 'CNOT control on q0, step 2' })).toBeFocused();

  await expect(outcome(page, '|000⟩: 50%')).toBeVisible();
  await expect(outcome(page, '|110⟩: 50%')).toBeVisible();

  await page.keyboard.press('Delete');
  await expect(outcome(page, '|100⟩: 50%')).toBeVisible();
});

test('steps through a circuit with explanations and the matching code line', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await drag(page, paletteGate(page, /Hadamard/), cell(page, 0, 0));
  await drag(page, paletteGate(page, /^CNOT/), cell(page, 1, 0));
  await expect(outcome(page, '|110⟩: 50%')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'A conditional flip' })).toBeVisible();

  await page.getByRole('button', { name: 'Previous step' }).click();
  await expect(page.getByText('after step 1')).toBeVisible();
  await expect(outcome(page, '|100⟩: 50%')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Superposition' })).toBeVisible();
  await expect(page.locator('.code-line[data-current]')).toHaveText(/^qc\.h\(0\)/);
  await expect(page.getByRole('img', { name: /^q0: \|\+⟩/ })).toBeVisible();

  await page.getByRole('slider', { name: 'Step through the circuit' }).press('Home');
  await expect(page.getByText('at the start')).toBeVisible();
  await expect(outcome(page, '|000⟩: 100%')).toBeVisible();

  await page.getByRole('tab', { name: 'Qiskit' }).press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Cirq' })).toBeFocused();
  await page.getByRole('button', { name: 'Copy' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('cirq.Moment(cirq.CNOT(q[0], q[1])),');

  const codeView = page.locator('#code-view');
  const before = (await codeView.boundingBox())!.height;
  await page.getByRole('separator', { name: 'Resize the code panel' }).press('ArrowUp');
  const height = async () => (await codeView.boundingBox())!.height;
  await expect.poll(async () => Math.abs((await height()) - (before + 24))).toBeLessThan(1);
  const handle = (await page.getByRole('separator').boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 - 100, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => Math.abs((await height()) - (before + 124))).toBeLessThan(1);

  await page.getByRole('switch', { name: 'Learn mode' }).uncheck();
  await expect(page.locator('.callout')).toHaveCount(0);
});

test('loads an example and shares it as a link', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Examples' }).click();
  await page.getByRole('button', { name: /^GHZ state/ }).click();
  await expect(page.getByRole('banner').getByText('GHZ state')).toBeVisible();
  await expect(page.getByText('Move the H gate after the first CNOT.')).toBeVisible();
  await expect(outcome(page, '|111⟩: 50%')).toBeVisible();

  await page.getByRole('button', { name: 'Share' }).click();
  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.getByText('Link copied')).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());

  const other = await context.newPage();
  await other.goto(link);
  await expect(other.getByRole('banner').getByText('GHZ state')).toBeVisible();
  await expect(outcome(other, '|111⟩: 50%')).toBeVisible();
  await other.reload();
  await expect(outcome(other, '|111⟩: 50%')).toBeVisible();
});

test('imports OpenQASM and Quirk links and explains what it cannot read', async ({ page }) => {
  await page.getByRole('button', { name: 'Open' }).click();
  const code = page.getByRole('textbox', { name: 'OpenQASM 2.0 code or Quirk link' });
  await code.fill('OPENQASM 2.0;\nqreg q[1];\nu3(0,0,0) q[0];');
  await page.getByRole('button', { name: 'Import' }).click();
  await expect(page.getByRole('alert')).toHaveText("Line 3: Qanvas doesn't have the u3 gate yet.");

  await code.fill('OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\nh q[0];\ncx q[0],q[1];');
  await page.getByRole('button', { name: 'Import' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(outcome(page, '|11⟩: 50%')).toBeVisible();

  await page.getByRole('button', { name: 'Open' }).click();
  await code.fill('https://algassert.com/quirk#circuit={"cols":[["H"],["◦","X"]]}');
  await page.getByRole('button', { name: 'Import' }).click();
  await expect(page.getByRole('alert')).toHaveText("Qanvas doesn't have these Quirk gates yet: ◦. Your circuit hasn't changed.");
  await code.fill('https://algassert.com/quirk#circuit=%7B%22cols%22%3A%5B%5B%22X%22%5D%2C%5B%22Measure%22%5D%5D%7D');
  await page.getByRole('button', { name: 'Import' }).click();
  await expect(outcome(page, '|1⟩: 100%')).toBeVisible();
});

test('downloads the circuit as a notebook, a script or OpenQASM', async ({ page }) => {
  await page.getByRole('button', { name: 'Examples' }).click();
  await page.getByRole('button', { name: /^Bell state/ }).click();
  await page.getByRole('tab', { name: 'Cirq' }).click();
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Cirq' })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Open in notebook' })).toHaveCount(0);

  await page.getByRole('radio', { name: 'pyQuil' }).check();
  const [notebook] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Notebook (.ipynb)' }).click()]);
  expect(notebook.suggestedFilename()).toBe('bell-pyquil.ipynb');
  const cells = JSON.parse(await readFile((await notebook.path())!, 'utf8')).cells;
  expect(cells[0].source.join('')).toContain('# Bell state');
  expect(cells[1].source.join('')).toContain('program += CNOT(0, 1)');

  const [qasm] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'OpenQASM (.qasm)' }).click()]);
  expect(qasm.suggestedFilename()).toBe('bell.qasm');
  expect(await readFile((await qasm.path())!, 'utf8')).toContain('cx q[0],q[1];');

  await page.keyboard.press('Escape');
  await drag(page, paletteGate(page, /Hadamard/), cell(page, 2, 0));
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  const [edited] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Notebook (.ipynb)' }).click()]);
  expect(edited.suggestedFilename()).toBe('circuit-cirq.ipynb');
  expect(JSON.parse(await readFile((await edited.path())!, 'utf8')).cells[0].source[0]).toBe('# Qanvas circuit\n');
});

test('opens the circuit as a notebook in JupyterLab when running in quantum-lab', async ({ page, context }) => {
  let saved: { name: string; notebook: { cells: { source: string[] }[] } } | undefined;
  await page.route('**/api/health', (route) => route.fulfill({ json: { version: 1, features: ['notebook'] } }));
  await page.route('**/api/notebook', async (route) => {
    saved = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { path: 'qanvas/bell-qiskit.ipynb', url: new URL('/?opened-in-jupyter', route.request().url()).href } });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Examples' }).click();
  await page.getByRole('button', { name: /^Bell state/ }).click();
  await page.getByRole('button', { name: 'Download', exact: true }).click();

  const [jupyter] = await Promise.all([context.waitForEvent('page'), page.getByRole('button', { name: 'Open in notebook' }).click()]);
  await expect(page.getByText("Saved as qanvas/bell-qiskit.ipynb in the lab's notebooks folder.")).toBeVisible();
  await expect.poll(() => jupyter.url()).toContain('?opened-in-jupyter');
  expect(saved?.name).toBe('bell-qiskit');
  expect(saved?.notebook.cells[1].source.join('')).toContain('qc.cx(0, 1)');
});

test('edits the OpenQASM code and keeps the last valid circuit', async ({ page }) => {
  await expect(page.getByText('Editing Qiskit, Cirq and pyQuil code is coming to quantum-lab.', { exact: false })).toBeVisible();
  await page.getByRole('tab', { name: 'OpenQASM' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const code = page.getByRole('textbox', { name: 'OpenQASM 2.0 code' });
  await code.fill('OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\nh q[0];\ncx q[0],q[1];');
  await expect(outcome(page, '|11⟩: 50%')).toBeVisible();

  await code.fill('OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\nh q[0];\ncx q[0],');
  await expect(page.getByRole('status').filter({ hasText: 'Line 5' })).toHaveText("Line 5: Qanvas couldn't read this statement. The circuit keeps its last valid version.");
  await expect(outcome(page, '|11⟩: 50%')).toBeVisible();

  await page.getByRole('button', { name: 'Done' }).click();
  await expect(code).toBeVisible();
  await code.fill('OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\nh q[0];\ncx q[0],q[1];\n// done');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('#code-view')).toContainText('cx q[0],q[1];');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(outcome(page, '|000⟩: 100%')).toBeVisible();
});

test('keeps working offline after the first visit', async ({ page, context }) => {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await drag(page, paletteGate(page, /Hadamard/), cell(page, 0, 0));
  await expect(outcome(page, '|100⟩: 50%')).toBeVisible();
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', 'manifest.webmanifest');
});

test('switches the interface to Spanish', async ({ page }) => {
  await page.getByRole('button', { name: 'Español' }).click();
  await expect(page.getByRole('heading', { name: 'Si midieras ahora' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
});

test('fits a phone screen without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /Add qubit/ }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('has no automatically detectable accessibility issues', async ({ page }) => {
  await drag(page, paletteGate(page, /Hadamard/), cell(page, 0, 0));
  await drag(page, paletteGate(page, /^Rx/), cell(page, 0, 1));
  await drag(page, paletteGate(page, /^CNOT/), cell(page, 1, 0));
  await page.getByRole('button', { name: 'Previous step' }).click();
  await page.getByText('Amplitudes').click();
  const describe = (violations: { id: string; nodes: { target: unknown }[] }[]) => violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`);
  expect(describe((await new AxeBuilder({ page }).analyze()).violations)).toEqual([]);

  await page.getByRole('tab', { name: 'OpenQASM' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('textbox', { name: 'OpenQASM 2.0 code' }).fill('OPENQASM 2.0;\nqreg q[1];\nfoo q[0];');
  await expect(page.getByText('The circuit keeps its last valid version.', { exact: false })).toBeVisible();
  expect(describe((await new AxeBuilder({ page }).analyze()).violations)).toEqual([]);
  await page.getByRole('button', { name: 'Done' }).click();

  for (const dialog of ['Examples', 'Open', 'Share', 'Download']) {
    await page.getByRole('button', { name: dialog, exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(describe((await new AxeBuilder({ page }).include('dialog').analyze()).violations)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
  }
});
