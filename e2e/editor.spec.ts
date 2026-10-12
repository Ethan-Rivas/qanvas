import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

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

  await page.getByRole('switch', { name: 'Learn mode' }).uncheck();
  await expect(page.locator('.callout')).toHaveCount(0);
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
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
});
