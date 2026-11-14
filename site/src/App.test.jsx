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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
  for (const name of ['showModal', 'close']) {
    if (dialogMethods[name]) Object.defineProperty(HTMLDialogElement.prototype, name, dialogMethods[name]);
    else delete HTMLDialogElement.prototype[name];
  }
});

const noConfig = async () => null;
const clock = () => time;
const button = (label, scope = host) => [...scope.querySelectorAll('button')].find((control) => control.textContent.includes(label) || control.getAttribute('aria-label')?.includes(label));
const click = async (label, scope = host) => act(async () => button(label, scope).click());
const advance = async (ms) => {
  time += ms;
  await act(async () => vi.advanceTimersByTime(ms));
};

async function mount(props = {}) {
  await act(async () => root.render(<App loadConfigImpl={noConfig} clock={clock} {...props} />));
}

/**
 * jsdom does not activate a button on Enter or Space. Emulate that default
 * only when the page left the relevant key event uncancelled.
 */
const pressKey = async (key) => {
  const target = document.activeElement;
  const down = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  await act(async () => target.dispatchEvent(down));
  if (key === 'Enter' && !down.defaultPrevented && target.isConnected) await act(async () => target.click());
  const upTarget = document.activeElement;
  const up = new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true });
  await act(async () => upTarget.dispatchEvent(up));
  if (key === ' ' && !down.defaultPrevented && !up.defaultPrevented && upTarget === target) await act(async () => target.click());
  return { down, up };
};

test('the home shell has navigation and bottom API status without branding, clocks or sample content', async () => {
  await mount();
  expect(button('Home')).toBeDefined();
  expect(button('Browse items').getAttribute('aria-haspopup')).toBe('dialog');
  expect(host.querySelector('.foot').textContent).toContain('API not configured');
  expect(host.querySelector('.kiosk-content').textContent).not.toContain('API not configured');
  expect(host.textContent).not.toMatch(/sample|demo|Shed|\d{1,2}:\d{2}/i);
  expect(host.querySelector('.banner, .example, .status-title, .status-time')).toBeNull();
});

test('an unreadable config reports configuration unavailability without checking health', async () => {
  const checkHealthImpl = vi.fn();
  await mount({ loadConfigImpl: async () => { throw new Error('config unavailable'); }, checkHealthImpl });
  expect(host.querySelector('.foot').textContent).toContain('API configuration unavailable');
  expect(host.textContent).not.toContain('API not configured');
  expect(button('Voice input unavailable').disabled).toBe(true);
  expect(checkHealthImpl).not.toHaveBeenCalled();
});

test.each([[true, 'API connected'], [false, 'API unavailable']])('health %s changes status to %s without enabling voice or inventory', async (healthy, status) => {
  await mount({ loadConfigImpl: async () => ({ apiBase: 'https://api' }), checkHealthImpl: async () => healthy });
  expect(host.querySelector('.foot').textContent).toContain(status);
  expect(button('Voice input unavailable').disabled).toBe(true);
  await click('Browse items');
  const dialog = host.querySelector('dialog.sheet');
  expect(dialog.textContent).toContain('Inventory');
  expect(dialog.textContent).toContain('unavailable');
  expect(dialog.querySelector('.row')).toBeNull();
  expect(dialog.querySelector('.status')).not.toBeNull();
});

test('a rejected health request reports API unavailable', async () => {
  await mount({ loadConfigImpl: async () => ({ apiBase: 'https://api' }), checkHealthImpl: async () => { throw new Error('network failed'); } });
  expect(host.querySelector('.foot').textContent).toContain('API unavailable');
});

test('a pending health request leaves voice disabled and updates only the connection state on completion', async () => {
  let finish;
  const pending = new Promise((resolve) => { finish = resolve; });
  await mount({ loadConfigImpl: async () => ({ apiBase: 'https://api' }), checkHealthImpl: () => pending });
  expect(host.querySelector('.foot').textContent).toContain('Checking API');
  expect(button('Voice input unavailable').disabled).toBe(true);
  await act(async () => finish(true));
  expect(host.querySelector('.foot').textContent).toContain('API connected');
  expect(button('Voice input unavailable').disabled).toBe(true);
});

test('a late response from replaced connection inputs cannot overwrite the current status', async () => {
  let finish;
  const pending = new Promise((resolve) => { finish = resolve; });
  await mount({ loadConfigImpl: async () => ({ apiBase: 'https://old-api' }), checkHealthImpl: () => pending });
  await mount();
  expect(host.querySelector('.foot').textContent).toContain('API not configured');
  await act(async () => finish(true));
  expect(host.querySelector('.foot').textContent).toContain('API not configured');
});

test('the unavailable microphone cannot start simulated requests or local inventory changes', async () => {
  const fetchImpl = vi.fn();
  vi.stubGlobal('fetch', fetchImpl);
  await mount();
  await click('Voice input unavailable');
  await advance(10_000);
  expect(button('Voice input unavailable').disabled).toBe(true);
  expect(host.querySelector('.reply, .undo')).toBeNull();
  expect(host.textContent).not.toMatch(/script|sample|listening|thinking|Cordless drill/i);
  await click('Browse items');
  expect(host.querySelector('.row')).toBeNull();
  expect(host.querySelector('.sheet input')).toBeNull();
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('Home returns from Browse with the connection and motion preference intact', async () => {
  await mount({ loadConfigImpl: async () => ({ apiBase: 'https://api' }), checkHealthImpl: async () => true });
  await click('Pause motion');
  const home = button('Home');
  const content = host.querySelector('.kiosk-content');
  content.scrollTop = 120;
  button('Browse items').focus();
  await click('Browse items');
  const dialog = host.querySelector('dialog.sheet');
  await click('Home', dialog);
  expect(host.querySelector('dialog.sheet')).toBeNull();
  expect(document.activeElement).toBe(home);
  expect(content.scrollTop).toBe(0);
  expect(host.querySelector('.foot').textContent).toContain('API connected');
  expect(host.querySelector('.ambient-background').dataset.paused).toBe('true');
  expect(localStorage.getItem('shed-ambient-motion-paused')).toBe('true');
});

test('Home on the main screen restores its scroll position and focus', async () => {
  await mount();
  const home = button('Home');
  const content = host.querySelector('.kiosk-content');
  content.scrollTop = 120;
  await click('Home');
  expect(content.scrollTop).toBe(0);
  expect(document.activeElement).toBe(home);
});

test('Escape closes Browse and restores its opener', async () => {
  await mount();
  const browse = button('Browse items');
  browse.focus();
  await click('Browse items');
  const dialog = host.querySelector('dialog.sheet');
  await act(async () => dialog.dispatchEvent(new Event('cancel', { cancelable: true })));
  expect(host.querySelector('dialog.sheet')).toBeNull();
  expect(document.activeElement).toBe(browse);
});

test('the lock screen keeps the background and a clock-free hint after 90 seconds; a tap wakes it', async () => {
  await mount();
  const background = host.querySelector('.ambient-background');
  await advance(89_000);
  expect(host.querySelector('.saver')).toBeNull();
  await advance(2_000);
  const saver = host.querySelector('.saver');
  expect(saver).not.toBeNull();
  expect(saver.textContent).toBe('Tap anywhere');
  expect(host.querySelector('.kiosk').dataset.sleeping).toBe('true');
  expect(saver.dataset.paused).toBe('false');
  expect(host.querySelectorAll('.ambient-background')).toHaveLength(1);
  expect(host.querySelector('.ambient-background')).toBe(background);
  expect(background.dataset.paused).toBe('false');
  await click('Wake the screen');
  expect(host.querySelector('.saver')).toBeNull();
  expect(host.querySelector('.ambient-background')).toBe(background);
});

test.each([false, true])('a pointer gesture keeps the saver until its click and only wakes (Browse open: %s)', async (browseOpen) => {
  await mount();
  if (browseOpen) await click('Browse items');
  const dialog = host.querySelector('dialog.sheet');
  const motion = button('Pause motion', dialog ?? host);
  motion.focus();
  await advance(91_000);
  const saver = host.querySelector('.saver');

  for (const type of ['pointerdown', 'pointerup']) {
    await act(async () => saver.dispatchEvent(new Event(type, { bubbles: true, cancelable: true })));
    expect(host.querySelector('.saver')).toBe(saver);
    expect(document.activeElement).toBe(saver);
    expect(host.querySelector('.kiosk-content').hasAttribute('inert')).toBe(true);
    if (dialog) expect(dialog.open).toBe(false);
  }

  await act(async () => saver.click());
  expect(host.querySelector('.saver')).toBeNull();
  expect(host.querySelector('dialog.sheet')).toBe(dialog);
  if (dialog) expect(dialog.open).toBe(true);
  expect(document.activeElement).toBe(motion);
  expect(localStorage.getItem('shed-ambient-motion-paused')).toBe('false');
});

test.each(['manual pause', 'reduced motion', 'hidden page'])('the lock screen respects %s without replacing the saved preference', async (reason) => {
  let hidden;
  if (reason === 'manual pause') localStorage.setItem('shed-ambient-motion-paused', 'true');
  if (reason === 'reduced motion') {
    const media = new EventTarget();
    media.matches = true;
    vi.stubGlobal('matchMedia', () => media);
  }
  if (reason === 'hidden page') hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  await mount();
  await advance(91_000);
  expect(host.querySelector('.saver')).not.toBeNull();
  expect(host.querySelector('.ambient-background').dataset.paused).toBe('true');
  expect(localStorage.getItem('shed-ambient-motion-paused')).toBe(String(reason === 'manual pause'));
  expect(host.querySelector('.saver').dataset.paused).toBe('true');
  if (hidden) {
    hidden.mockReturnValue(false);
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(host.querySelector('.saver').dataset.paused).toBe('false');
  }
  await click('Wake the screen');
  expect(host.querySelector('.ambient-background').dataset.paused).toBe(String(reason !== 'hidden page'));
});

test('no display-clock or periodic app timer runs while idle or sleeping', async () => {
  const readClock = vi.fn(clock);
  const format = vi.spyOn(Date.prototype, 'toLocaleTimeString');
  await mount({ clock: readClock });
  readClock.mockClear();
  await advance(60_000);
  expect(readClock).not.toHaveBeenCalled();
  expect(format).not.toHaveBeenCalled();
  await advance(31_000);
  expect(host.querySelector('.saver')).not.toBeNull();
  readClock.mockClear();
  await advance(120_000);
  expect(readClock).not.toHaveBeenCalled();
  expect(format).not.toHaveBeenCalled();
});

test('Browse suspends while sleeping and restores its scroll and focus when waking', async () => {
  await mount();
  await click('Browse items');
  const dialog = host.querySelector('dialog.sheet');
  dialog.querySelector('.sheet-content').scrollTop = 40;
  const control = button('Home', dialog);
  control.focus();
  await advance(91_000);
  expect(host.querySelector('dialog.sheet')).toBe(dialog);
  expect(dialog.open).toBe(false);
  expect(document.activeElement).toBe(host.querySelector('.saver'));
  await pressKey('Escape');
  expect(host.querySelector('.saver')).toBeNull();
  expect(dialog.open).toBe(true);
  expect(dialog.querySelector('.sheet-content').scrollTop).toBe(40);
  expect(document.activeElement).toBe(control);
});

test.each([['Enter'], [' ']])('one %j key wakes the screensaver without activating the underlying Browse button', async (key) => {
  await mount();
  const browse = button('Browse items');
  browse.focus();
  await advance(91_000);
  expect(document.activeElement).toBe(host.querySelector('.saver'));
  expect(host.querySelector('.kiosk-content').hasAttribute('inert')).toBe(true);
  expect(host.querySelector('.foot').hasAttribute('inert')).toBe(true);
  const { down, up } = await pressKey(key);
  expect(down.defaultPrevented).toBe(true);
  expect(up.defaultPrevented).toBe(true);
  expect(host.querySelector('.saver')).toBeNull();
  expect(host.querySelector('dialog.sheet')).toBeNull();
  expect(host.querySelector('.kiosk-content').hasAttribute('inert')).toBe(false);
  expect(document.activeElement).toBe(browse);
  await pressKey(key);
  expect(host.querySelector('dialog.sheet')).not.toBeNull();
});

test('waking with nothing focused returns focus to Home', async () => {
  await mount();
  document.activeElement.blur();
  await advance(91_000);
  await pressKey('Escape');
  expect(document.activeElement).toBe(button('Home'));
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

test('the motion control pauses the shared background and saves the preference', async () => {
  await mount();
  await click('Pause motion');
  expect(button('Resume motion')).toBeDefined();
  expect(host.querySelector('.ambient-background').dataset.paused).toBe('true');
  expect(localStorage.getItem('shed-ambient-motion-paused')).toBe('true');
  await click('Resume motion');
  expect(host.querySelector('.ambient-background').dataset.paused).toBe('false');
  expect(localStorage.getItem('shed-ambient-motion-paused')).toBe('false');
});

test('Home receives focus when a device preference disables the focused motion control', async () => {
  const media = new EventTarget();
  media.matches = false;
  vi.stubGlobal('matchMedia', () => media);
  await mount();
  const control = button('Pause motion');
  await act(async () => control.focus());
  expect(document.activeElement).toBe(control);
  await act(async () => {
    media.matches = true;
    media.dispatchEvent(new Event('change'));
  });
  expect(control.disabled).toBe(true);
  expect(document.activeElement).toBe(button('Home'));
  expect(host.querySelector('.ambient-background').dataset.paused).toBe('true');
});
