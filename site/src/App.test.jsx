import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host;
let root;
let time;

beforeEach(() => {
  vi.useFakeTimers();
  time = 1_000_000;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

const sample = async () => null;
const clock = () => time;
const button = (label) => [...host.querySelectorAll('button')].find((b) => b.textContent.includes(label) || b.getAttribute('aria-label')?.includes(label));
const advance = async (ms) => {
  time += ms;
  await act(async () => vi.advanceTimersByTime(ms));
};

async function mount(props = {}) {
  await act(async () => root.render(<App loadConfigImpl={sample} clock={clock} listenMs={1000} thinkMs={100} {...props} />));
}

test('with no config.json it says it is a mockup on sample data', async () => {
  await mount();
  expect(host.textContent).toContain('Sample data');
  expect(host.textContent).toContain('Mockup');
});

test.each([[true, 'Online'], [false, 'Offline']])('a deployed API health result of %s shows %s without hiding the mockup disclosure', async (healthy, status) => {
  await mount({ loadConfigImpl: async () => ({ apiBase: 'https://api' }), checkHealthImpl: async () => healthy });
  expect(host.textContent).toContain(status);
  expect(host.textContent).toContain('Mockup: sample inventory, nothing is saved, and the mic plays a script.');
});

test('the mockup disclosure stays visible while the API health check is pending', async () => {
  let finishHealthCheck;
  const healthCheck = new Promise((resolve) => { finishHealthCheck = resolve; });
  await mount({ loadConfigImpl: async () => ({ apiBase: 'https://api' }), checkHealthImpl: () => healthCheck });
  expect(host.textContent).toContain('Connecting');
  expect(host.textContent).toContain('Mockup: sample inventory, nothing is saved, and the mic plays a script.');

  await act(async () => finishHealthCheck(true));
  expect(host.textContent).toContain('Online');
  expect(host.textContent).toContain('Mockup: sample inventory, nothing is saved, and the mic plays a script.');
});

test('tap, listen, answer: the first script line finds the drill', async () => {
  await mount();
  await act(async () => button('Tap to speak').click());
  expect(host.textContent).toContain('Listening');
  await advance(1000);
  expect(host.textContent).toContain('Looking');
  await advance(100);
  expect(host.textContent).toContain('Cordless drill');
  expect(host.textContent).toContain('Pegboard');
});

/** Tap the mic and let it hear the next script line. */
const speak = async () => {
  await act(async () => button('Tap to speak').click());
  await advance(1100);
};

test('a finding offers no Undo; stopping early hears the line at once', async () => {
  await mount();
  await act(async () => button('Tap to speak').click());
  await act(async () => button('Listening').click());
  await advance(100);
  expect(host.textContent).toContain('Pegboard');
  expect(button('Undo')).toBeUndefined();
});

test('a vague request asks which one, the pick applies it, and Undo puts the count back', async () => {
  await mount();
  for (let i = 0; i < 4; i++) await speak(); // the fourth line is "three lightbulbs"
  expect(host.textContent).toContain('Which one did you mean?');
  await act(async () => button('LED bulbs').click());
  expect(host.textContent).toContain('9 bulbs left');
  expect(button('Undo').textContent).toContain('10s');

  await act(async () => button('Undo').click());
  expect(host.textContent).toContain('Undone');
  await act(async () => button('Search or browse').click());
  const led = [...host.querySelectorAll('.row')].find((r) => r.textContent.includes('LED bulbs'));
  expect(led.querySelector('.row-count').textContent).toBe('12');
});

test('Undo disappears after ten seconds', async () => {
  await mount();
  await act(async () => button('Tap to speak').click());
  await advance(1100); // finds the drill
  await act(async () => button('Tap to speak').click());
  await advance(1100); // takes the drill
  expect(button('Undo')).toBeDefined();
  await advance(10_500);
  expect(button('Undo')).toBeUndefined();
});

const rowFor = (name) => [...host.querySelectorAll('.row')].find((row) => row.querySelector('.row-name').textContent === name);
const ledName = 'LED bulbs (A19, 60W equivalent)';
const stockCount = (name) => Number(rowFor(name).querySelector('.row-count').textContent);
const click = async (label) => act(async () => button(label).click());

test.each([
  ['One more', 13],
  ['One fewer', 11]
])('manual stock: %s offers Undo inside the browse sheet', async (control, count) => {
  await mount();
  await click('Search or browse');
  await click(`${control} ${ledName}`);

  expect(stockCount(ledName)).toBe(count);
  expect(host.querySelector('.sheet [role="status"]').textContent).toBe(`Updated ${ledName}.`);
  expect(host.querySelectorAll('button.undo')).toHaveLength(1);
  expect(host.querySelector('.sheet button.undo').textContent).toContain('10s');
  await click('Undo');
  expect(stockCount(ledName)).toBe(12);
  expect(host.querySelector('.sheet [role="status"]').textContent).toBe('Last change undone.');
  expect(button('Undo')).toBeUndefined();
});

test('manual tool Undo restores both the in and out states', async () => {
  await mount();
  await click('Search or browse');
  const state = () => rowFor('Cordless drill').querySelector('.tool-state').textContent;

  await click('Cordless drill is');
  expect(state()).toBe('Out');
  await click('Undo');
  expect(state()).toBe('In');

  await click('Cordless drill is');
  await click('Cordless drill is');
  expect(state()).toBe('In');
  await click('Undo');
  expect(state()).toBe('Out');
});

test('the latest manual edit replaces a previous voice Undo', async () => {
  await mount();
  await speak();
  await speak(); // takes the drill
  await click('Search or browse');
  expect(host.querySelectorAll('button.undo')).toHaveLength(1);
  await click(`One more ${ledName}`);
  await click('Undo');

  expect(stockCount(ledName)).toBe(12);
  expect(rowFor('Cordless drill').querySelector('.tool-state').textContent).toBe('Out');
});

test('Undo reverses only the latest of successive manual changes', async () => {
  await mount();
  await click('Search or browse');
  await click(`One more ${ledName}`);
  await click('One more Wood glue');
  await click('Undo');

  expect(stockCount('Wood glue')).toBe(2);
  expect(stockCount(ledName)).toBe(13);
});

test('manual Undo remains available after closing the browse sheet', async () => {
  await mount();
  await click('Search or browse');
  await click(`One more ${ledName}`);
  await click('Close search');
  expect(host.querySelector('.reply button.undo')).not.toBeNull();
  await click('Undo');
  await click('Search or browse');
  expect(stockCount(ledName)).toBe(12);
  expect(button('Undo')).toBeUndefined();
});

test('closing and reopening browse does not extend manual Undo beyond ten seconds', async () => {
  await mount();
  await click('Search or browse');
  await click(`One more ${ledName}`);
  await advance(4000);
  await click('Close search');
  expect(button('Undo').textContent).toContain('6s');
  await click('Search or browse');
  expect(button('Undo').textContent).toContain('6s');
  await advance(6000);
  expect(button('Undo')).toBeUndefined();
  expect(stockCount(ledName)).toBe(13);
  await click('Close search');
  expect(button('Undo')).toBeUndefined();
});

test('an Undo click after its deadline cannot beat the next clock render', async () => {
  await mount();
  await click('Search or browse');
  await click(`One more ${ledName}`);
  time += 10_001;
  await click('Undo');
  expect(stockCount(ledName)).toBe(13);
  expect(button('Undo')).toBeUndefined();
});

test.each([
  ['listening', 0],
  ['thinking', 1000]
])('a manual edit supersedes a pending %s answer', async (_, delay) => {
  await mount();
  await click('Tap to speak');
  await advance(delay);
  await click('Search or browse');
  await click(`One more ${ledName}`);
  await advance(1100);

  expect(host.querySelector('.sheet [role="status"]').textContent).toBe(`Updated ${ledName}.`);
  await click('Undo');
  expect(stockCount(ledName)).toBe(12);
});

test('the screensaver comes on after a minute and a half untouched, and a tap wakes it', async () => {
  await mount();
  await advance(89_000);
  expect(host.querySelector('.saver')).toBeNull();
  await advance(2_000);
  expect(host.querySelector('.saver')).not.toBeNull();
  await act(async () => button('Wake the screen').click());
  await advance(500);
  expect(host.querySelector('.saver')).toBeNull();
});
