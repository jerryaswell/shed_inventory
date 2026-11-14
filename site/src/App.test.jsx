import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host;
let root;
let time;
const dialogMethods = Object.getOwnPropertyDescriptors(HTMLDialogElement.prototype);

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  // jsdom has no native modal API; browser checks cover inertness and focus.
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value() { this.open = true; } },
    close: { configurable: true, value() { this.open = false; } }
  });
  time = 1_000_000;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  localStorage.clear();
  for (const name of ['showModal', 'close']) {
    if (dialogMethods[name]) Object.defineProperty(HTMLDialogElement.prototype, name, dialogMethods[name]);
    else delete HTMLDialogElement.prototype[name];
  }
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

test('with no config.json it identifies the demo, sample inventory, and absent API', async () => {
  await mount();
  expect(host.textContent).toContain('Sample inventory');
  expect(host.textContent).toContain('API not configured');
  expect(host.textContent).toContain('Demo');
});

test.each([[true, 'API connected'], [false, 'API unavailable']])('a deployed API health result of %s shows %s without hiding the sample disclosure', async (healthy, status) => {
  await mount({ loadConfigImpl: async () => ({ apiBase: 'https://api' }), checkHealthImpl: async () => healthy });
  expect(host.textContent).toContain(status);
  expect(host.textContent).toContain('Sample inventory. Nothing is saved. No audio is recorded.');
});

test('the sample disclosure stays visible while the API health check is pending', async () => {
  let finishHealthCheck;
  const healthCheck = new Promise((resolve) => { finishHealthCheck = resolve; });
  await mount({ loadConfigImpl: async () => ({ apiBase: 'https://api' }), checkHealthImpl: () => healthCheck });
  expect(host.textContent).toContain('Checking API');
  expect(host.textContent).toContain('Sample inventory. Nothing is saved. No audio is recorded.');

  await act(async () => finishHealthCheck(true));
  expect(host.textContent).toContain('API connected');
  expect(host.textContent).toContain('Sample inventory. Nothing is saved. No audio is recorded.');
});

test('the sample action makes its simulated and busy states explicit before finding the drill', async () => {
  await mount();
  expect(button('Try a sample')).toBeDefined();
  expect(button('Tap to speak')).toBeUndefined();
  await act(async () => button('Try a sample').click());
  expect(host.textContent).toContain('Preparing a scripted request');
  expect(button('Run sample now')).toBeDefined();
  await advance(1000);
  expect(host.textContent).toContain('Finding sample items');
  expect(button('Finding sample items').disabled).toBe(true);
  await advance(100);
  expect(host.textContent).toContain('Cordless drill');
  expect(host.textContent).toContain('Pegboard');
});

/** Tap the mic and let it hear the next script line. */
const speak = async () => {
  await act(async () => host.querySelector('button.mic').click());
  await advance(1100);
};

test('a finding offers no Undo; stopping early hears the line at once', async () => {
  await mount();
  await act(async () => host.querySelector('button.mic').click());
  await act(async () => button('Run sample now').click());
  await advance(100);
  expect(host.textContent).toContain('Pegboard');
  expect(button('Undo')).toBeUndefined();
});

test('a vague request asks which one, the pick applies it, and Undo puts the count back', async () => {
  await mount();
  for (let i = 0; i < 4; i++) await speak(); // the fourth line is "three lightbulbs"
  expect(host.textContent).toContain('Which one did you mean?');
  await act(async () => button('LED bulbs').click());
  expect(host.querySelector('.reply-stock').textContent).toBe('9 bulbs');
  expect(button('Undo').textContent).toContain('10s');

  await act(async () => button('Undo').click());
  expect(host.textContent).toContain('Change undone');
  await act(async () => button('Browse items').click());
  const led = [...host.querySelectorAll('.row')].find((r) => r.textContent.includes('LED bulbs'));
  expect(led.querySelector('.row-count').textContent).toBe('12 bulbs');
});

test('Undo disappears after ten seconds', async () => {
  await mount();
  await act(async () => host.querySelector('button.mic').click());
  await advance(1100); // finds the drill
  await act(async () => host.querySelector('button.mic').click());
  await advance(1100); // takes the drill
  expect(button('Undo')).toBeDefined();
  await advance(10_500);
  expect(button('Undo')).toBeUndefined();
});

const rowFor = (name) => [...host.querySelectorAll('.row')].find((row) => row.querySelector('.row-name').textContent === name);
const ledName = 'LED bulbs (A19, 60W equivalent)';
const stockCount = (name) => Number.parseInt(rowFor(name).querySelector('.row-count').textContent, 10);
const click = async (label) => act(async () => button(label).click());

test.each([
  ['Add one bulb to', 13],
  ['Remove one bulb from', 11]
])('manual stock: %s offers Undo inside the browse sheet', async (control, count) => {
  await mount();
  await click('Browse items');
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
  await click('Browse items');
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
  await click('Browse items');
  expect(host.querySelectorAll('button.undo')).toHaveLength(1);
  await click(`Add one bulb to ${ledName}`);
  await click('Undo');

  expect(stockCount(ledName)).toBe(12);
  expect(rowFor('Cordless drill').querySelector('.tool-state').textContent).toBe('Out');
});

test('Undo reverses only the latest of successive manual changes', async () => {
  await mount();
  await click('Browse items');
  await click(`Add one bulb to ${ledName}`);
  await click('Add one bottle to Wood glue');
  await click('Undo');

  expect(stockCount('Wood glue')).toBe(2);
  expect(stockCount(ledName)).toBe(13);
});

test('manual Undo remains available after closing the browse sheet', async () => {
  await mount();
  await click('Browse items');
  await click(`Add one bulb to ${ledName}`);
  await click('Close search');
  expect(host.querySelector('.foot button.undo')).not.toBeNull();
  await click('Undo');
  await click('Browse items');
  expect(stockCount(ledName)).toBe(12);
  expect(button('Undo')).toBeUndefined();
});

test('closing and reopening browse does not extend manual Undo beyond ten seconds', async () => {
  await mount();
  await click('Browse items');
  await click(`Add one bulb to ${ledName}`);
  await advance(4000);
  await click('Close search');
  expect(button('Undo').textContent).toContain('6s');
  await click('Browse items');
  expect(button('Undo').textContent).toContain('6s');
  await advance(6000);
  expect(button('Undo')).toBeUndefined();
  expect(stockCount(ledName)).toBe(13);
  await click('Close search');
  expect(button('Undo')).toBeUndefined();
});

test('an Undo click after its deadline cannot beat the next clock render', async () => {
  await mount();
  await click('Browse items');
  await click(`Add one bulb to ${ledName}`);
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
  await act(async () => host.querySelector('button.mic').click());
  await advance(delay);
  await click('Browse items');
  await click(`Add one bulb to ${ledName}`);
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
  expect(host.querySelector('.ambient-background').dataset.sleeping).toBe('true');
  expect(host.querySelector('.ambient-background').dataset.paused).toBe('true');
  await act(async () => button('Wake the screen').click());
  await advance(500);
  expect(host.querySelector('.saver')).toBeNull();
  expect(host.querySelector('.ambient-background').dataset.paused).toBe('false');
});

test('home has one sample action, one example, and a persistent browse entry', async () => {
  await mount();
  expect(host.querySelectorAll('.stage button')).toHaveLength(1);
  expect(host.querySelectorAll('.foot button')).toHaveLength(1);
  expect(host.querySelectorAll('.example')).toHaveLength(1);
  expect(host.querySelector('.example').textContent).toContain("Where's the cordless drill?");
  expect(button('Browse items').getAttribute('aria-haspopup')).toBe('dialog');

  await speak();
  expect(button('Next sample')).toBeDefined();
  expect(button('Browse items')).toBeDefined();
});

test('a result shows the item, location, and stock once with Undo outside the scrolling stage', async () => {
  await mount();
  await speak();
  const reply = host.querySelector('.reply');
  expect(reply.querySelector('h2').textContent).toBe('Cordless drill');
  expect(reply.textContent.match(/Pegboard/g)).toHaveLength(1);
  expect(reply.textContent.match(/Left side/g)).toHaveLength(1);
  expect(reply.textContent.match(/in the shed/g)).toHaveLength(1);

  await speak();
  expect(host.querySelector('.reply-summary').textContent).toBe('Taken');
  expect(host.querySelector('.reply-stock').textContent).toBe('out of the shed');
  expect(host.querySelector('.stage button.undo')).toBeNull();
  expect(host.querySelector('.foot button.undo')).not.toBeNull();
  expect(button('Undo').querySelector('.undo-left').getAttribute('aria-hidden')).toBe('true');
  await click('Undo');
  expect(host.querySelector('.reply-name').textContent).toBe('Cordless drill');
  expect(host.querySelector('.reply-stock').textContent).toBe('in the shed');
});

test('a tool return identifies the action and Undo restores its checked-out state', async () => {
  await mount();
  for (let i = 0; i < 5; i++) await speak();
  expect(host.querySelector('.reply-summary').textContent).toBe('Returned');
  expect(host.querySelector('.reply-stock').textContent).toBe('in the shed');
  await click('Undo');
  expect(host.querySelector('.reply-stock').textContent).toBe('out of the shed');
});

test('keyboard activity keeps the kiosk awake for a full idle period', async () => {
  await mount();
  await advance(89_000);
  await act(async () => button('Browse items').dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })));
  await advance(2_000);
  expect(host.querySelector('.saver')).toBeNull();
  await advance(89_000);
  expect(host.querySelector('.saver')).not.toBeNull();
});

test('the motion control pauses the integrated background and saves the preference', async () => {
  await mount();
  const control = host.querySelector('.motion-toggle');
  expect(control.textContent).toBe('Pause motion');
  await act(async () => control.click());
  expect(control.textContent).toBe('Resume motion');
  expect(host.querySelector('.ambient-background').dataset.paused).toBe('true');
  expect(localStorage.getItem('shed-ambient-motion-paused')).toBe('true');
  await act(async () => control.click());
  expect(host.querySelector('.ambient-background').dataset.paused).toBe('false');
  expect(localStorage.getItem('shed-ambient-motion-paused')).toBe('false');
});
