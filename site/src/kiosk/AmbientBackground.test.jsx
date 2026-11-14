import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AmbientBackground from './AmbientBackground.jsx';
import { AMBIENT_PAUSE_KEY, useAmbientMotion } from './useAmbientMotion.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host;
let root;
let hidden;
let media;

function MotionExample({ sleeping = false }) {
  const motion = useAmbientMotion({ sleeping });
  return (
    <>
      <AmbientBackground paused={motion.paused} sleeping={sleeping} />
      <button type="button" onClick={motion.togglePause} disabled={motion.reducedMotion} aria-pressed={motion.userPaused}>
        Pause background
      </button>
    </>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  hidden = false;
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  media = new EventTarget();
  media.matches = false;
  vi.spyOn(media, 'addEventListener');
  vi.spyOn(media, 'removeEventListener');
  vi.stubGlobal('matchMedia', vi.fn(() => media));
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const mount = async (props = {}) => act(async () => root.render(<StrictMode><MotionExample {...props} /></StrictMode>));
const paused = () => host.querySelector('.ambient-background').dataset.paused === 'true';
const button = () => host.querySelector('button');
const toggle = async () => act(async () => button().click());
const setHidden = async (value) => act(async () => {
  hidden = value;
  document.dispatchEvent(new Event('visibilitychange'));
});
const setReducedMotion = async (value) => act(async () => {
  media.matches = value;
  media.dispatchEvent(new Event('change'));
});
const remount = async () => {
  act(() => root.unmount());
  root = createRoot(host);
  await mount();
};

test('manual pause and resume survive remounting', async () => {
  await mount();
  expect(paused()).toBe(false);
  await toggle();
  expect(paused()).toBe(true);
  expect(window.localStorage.getItem(AMBIENT_PAUSE_KEY)).toBe('true');

  await remount();
  expect(paused()).toBe(true);
  expect(button().getAttribute('aria-pressed')).toBe('true');
  await toggle();
  expect(window.localStorage.getItem(AMBIENT_PAUSE_KEY)).toBe('false');
  await remount();
  expect(paused()).toBe(false);
});

test('an existing pause preference stops motion on the initial render', async () => {
  window.localStorage.setItem(AMBIENT_PAUSE_KEY, 'true');
  await mount();
  expect(paused()).toBe(true);
});

test('reduced motion starts and remains static without replacing the manual preference', async () => {
  media.matches = true;
  await mount();
  expect(paused()).toBe(true);
  expect(button().disabled).toBe(true);
  await toggle();
  expect(window.localStorage.getItem(AMBIENT_PAUSE_KEY)).toBe('false');

  await setReducedMotion(false);
  expect(paused()).toBe(false);
  expect(button().disabled).toBe(false);
  await toggle();
  await setReducedMotion(true);
  await setReducedMotion(false);
  expect(paused()).toBe(true);
  expect(window.localStorage.getItem(AMBIENT_PAUSE_KEY)).toBe('true');
});

test('visibility stops motion immediately and restores only an unpaused background', async () => {
  hidden = true;
  await mount();
  expect(paused()).toBe(true);
  await setHidden(false);
  expect(paused()).toBe(false);
  await setHidden(true);
  expect(paused()).toBe(true);
  expect(window.localStorage.getItem(AMBIENT_PAUSE_KEY)).toBe('false');
  await setHidden(false);
  await toggle();
  await setHidden(true);
  await setHidden(false);
  expect(paused()).toBe(true);
});

test('sleep hides the colour fields and stops motion without changing the saved choice', async () => {
  await mount({ sleeping: true });
  expect(paused()).toBe(true);
  expect(host.querySelector('.ambient-background').dataset.sleeping).toBe('true');
  expect(window.localStorage.getItem(AMBIENT_PAUSE_KEY)).toBe('false');

  await mount({ sleeping: false });
  expect(paused()).toBe(false);
  await toggle();
  await mount({ sleeping: true });
  await mount({ sleeping: false });
  expect(paused()).toBe(true);
});

test('the decorative component enforces sleep even if passed an unpaused state', async () => {
  await act(async () => root.render(<AmbientBackground paused={false} sleeping />));
  expect(paused()).toBe(true);
  expect(host.querySelector('.ambient-background').getAttribute('aria-hidden')).toBe('true');
  expect(host.querySelectorAll('button, a, input, [tabindex]')).toHaveLength(0);
});

test('denied access to localStorage leaves pause usable for the current session', async () => {
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
    throw new DOMException('Storage is denied', 'SecurityError');
  });
  await mount();
  await toggle();
  expect(paused()).toBe(true);
  await setHidden(true);
  await setHidden(false);
  expect(paused()).toBe(true);
  await toggle();
  expect(paused()).toBe(false);
});

test('a failed storage write does not prevent resuming a saved pause', async () => {
  window.localStorage.setItem(AMBIENT_PAUSE_KEY, 'true');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Storage is full', 'QuotaExceededError');
  });
  await mount();
  expect(paused()).toBe(true);
  await toggle();
  expect(paused()).toBe(false);
});

test('visibility and manual pause still work when matchMedia is absent', async () => {
  vi.stubGlobal('matchMedia', undefined);
  await mount();
  expect(paused()).toBe(false);
  await setHidden(true);
  expect(paused()).toBe(true);
  await setHidden(false);
  await toggle();
  expect(paused()).toBe(true);
});

test('all media and visibility listeners are removed on unmount', async () => {
  const addVisibility = vi.spyOn(document, 'addEventListener');
  const removeVisibility = vi.spyOn(document, 'removeEventListener');
  await mount();
  await act(async () => root.render(null));

  for (const [event, listener] of media.addEventListener.mock.calls) {
    expect(media.removeEventListener).toHaveBeenCalledWith(event, listener);
  }
  const visibilityCalls = addVisibility.mock.calls.filter(([event]) => event === 'visibilitychange');
  expect(visibilityCalls.length).toBeGreaterThan(0);
  for (const [event, listener] of visibilityCalls) {
    expect(removeVisibility).toHaveBeenCalledWith(event, listener);
  }
});

test('older WebView media listeners also update and clean up', async () => {
  const legacyMedia = {
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn()
  };
  vi.stubGlobal('matchMedia', () => legacyMedia);
  await mount();
  const listener = legacyMedia.addListener.mock.lastCall[0];
  await act(async () => {
    legacyMedia.matches = true;
    listener();
  });
  expect(paused()).toBe(true);
  await act(async () => root.render(null));
  expect(legacyMedia.removeListener).toHaveBeenCalledWith(listener);
});
