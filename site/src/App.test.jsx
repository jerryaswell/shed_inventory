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

test('a deployed API that answers shows Online', async () => {
  await mount({ loadConfigImpl: async () => ({ apiBase: 'https://api' }), checkHealthImpl: async () => true });
  expect(host.textContent).toContain('Online');
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
