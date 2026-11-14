import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import SearchSheet from './SearchSheet.jsx';
import { testInventory } from '../test/fixtures/inventory.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host;
let root;
let opener;
let showModal;
let close;
const dialogMethods = Object.getOwnPropertyDescriptors(HTMLDialogElement.prototype);
const motion = { userPaused: false, reducedMotion: false, togglePause: () => {} };

beforeEach(() => {
  // jsdom does not implement the native dialog API or browser focus containment.
  showModal = vi.fn(function () { this.open = true; });
  close = vi.fn(function () { this.open = false; });
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: showModal },
    close: { configurable: true, value: close }
  });
  opener = document.createElement('button');
  opener.type = 'button';
  opener.textContent = 'Browse items';
  host = document.createElement('div');
  document.body.append(opener, host);
  opener.focus();
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  opener.remove();
  vi.restoreAllMocks();
  for (const name of ['showModal', 'close']) {
    if (dialogMethods[name]) Object.defineProperty(HTMLDialogElement.prototype, name, dialogMethods[name]);
    else delete HTMLDialogElement.prototype[name];
  }
});

async function mount(props = {}, strict = false) {
  const sheet = <SearchSheet onClose={() => root.render(null)} onHome={() => root.render(null)} status="online" motion={motion} {...props} />;
  await act(async () => root.render(strict ? <StrictMode>{sheet}</StrictMode> : sheet));
}

const button = (label) => [...host.querySelectorAll('button')].find((element) => element.getAttribute('aria-label') === label || element.textContent === label);
const rowFor = (name) => [...host.querySelectorAll('.row')].find((row) => row.querySelector('.row-name').textContent === name);

const searchFor = async (query) => {
  const input = host.querySelector('input');
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  await act(async () => {
    setValue.call(input, query);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const pressTab = async (element, shiftKey = false) => {
  const tab = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
  await act(async () => element.dispatchEvent(tab));
  return tab.defaultPrevented;
};

test.each([false, true])('unavailable inventory opens a named modal, focuses its title, and describes the unavailable state (Strict Mode: %s)', async (strict) => {
  await mount({}, strict);
  const dialog = host.querySelector('dialog');
  expect(dialog.open).toBe(true);
  expect(showModal).toHaveBeenCalled();
  expect(document.getElementById(dialog.getAttribute('aria-labelledby')).textContent).toBe('Browse items');
  expect(document.getElementById(dialog.getAttribute('aria-describedby')).textContent).toBe('Items will appear here when inventory is connected.');
  expect(host.textContent).toContain('Inventory unavailable');
  expect(host.querySelector('input')).toBeNull();
  expect(host.querySelectorAll('.row')).toHaveLength(0);
  expect(host.textContent).not.toMatch(/sample|demo|not saved|nothing matches|no items/i);
  expect(document.activeElement).toBe(host.querySelector('h1'));
});

test.each(['online', 'offline', 'unconfigured'])('API status %s never fabricates loaded inventory', async (status) => {
  await mount({ status });
  expect(host.textContent).toContain('Inventory unavailable');
  expect(host.querySelectorAll('.row')).toHaveLength(0);
  expect(host.querySelectorAll('[role="status"]')).toHaveLength(1);
  expect(host.querySelector('dialog').lastElementChild.classList.contains('status')).toBe(true);
});

test('an explicitly loaded empty inventory is distinct from an unavailable inventory', async () => {
  await mount({ items: [] });
  expect(host.textContent).toContain('No items yet.');
  expect(host.textContent).not.toContain('Inventory unavailable');
  expect(host.textContent).not.toContain('Nothing matches');
  expect(host.querySelector('input')).toBeNull();
});

test('native Escape cancellation closes through the parent and restores the opener', async () => {
  await mount();
  const cancel = new Event('cancel', { cancelable: true });
  await act(async () => host.querySelector('dialog').dispatchEvent(cancel));
  expect(cancel.defaultPrevented).toBe(true);
  expect(host.querySelector('dialog')).toBeNull();
  expect(close).toHaveBeenCalled();
  expect(document.activeElement).toBe(opener);
});

test('Home closes through its own callback without competing with destination focus', async () => {
  const onHome = vi.fn(() => root.render(null));
  const onClose = vi.fn();
  await mount({ onHome, onClose });
  const restore = vi.spyOn(opener, 'focus');
  await act(async () => button('Home').click());
  expect(onHome).toHaveBeenCalledTimes(1);
  expect(onClose).not.toHaveBeenCalled();
  expect(host.querySelector('dialog')).toBeNull();
  expect(restore).not.toHaveBeenCalled();
});

test('loaded inventory exposes labelled search and read-only stock and tool values', async () => {
  await mount({ items: testInventory });
  expect(host.querySelector('input').labels[0].textContent).toBe('Search items');
  expect(document.activeElement).toBe(host.querySelector('h1'));
  expect(rowFor('Deck screws (3")').querySelector('.row-stock').textContent).toBe('1 box');
  expect(rowFor('Work gloves').querySelector('.row-stock').textContent).toBe('3 pairs');
  expect(rowFor('Cordless drill').querySelector('.row-stock').textContent).toBe('in the shed');
  expect(host.querySelectorAll('.row button')).toHaveLength(0);
  expect(host.querySelector('.undo')).toBeNull();
});

test('search filters supplied inventory and distinguishes no matches from no items', async () => {
  await mount({ items: testInventory });
  await searchFor('pegboard');
  expect([...host.querySelectorAll('.row-name')].map((element) => element.textContent)).toEqual(['Duct tape', 'Cordless drill']);
  await searchFor('missing item');
  expect(host.querySelectorAll('.row')).toHaveLength(0);
  expect(host.querySelector('.sheet-empty').textContent).toBe('Nothing matches “missing item”.');
  await searchFor('');
  expect(host.querySelectorAll('.row')).toHaveLength(testInventory.length);
});

test.each([null, testInventory])('Tab contains controls and scrollable content for unavailable and loaded inventory', async (items) => {
  await mount({ items });
  const first = button('Home');
  const content = host.querySelector('[role="region"]');
  expect(content.getAttribute('aria-label')).toBe('Inventory content');
  expect(content.tabIndex).toBe(0);
  const last = host.querySelector('input') ?? content;
  last.focus();
  expect(await pressTab(last)).toBe(true);
  expect(document.activeElement).toBe(first);
  expect(await pressTab(first, true)).toBe(true);
  expect(document.activeElement).toBe(last);
  const title = host.querySelector('h1');
  title.focus();
  expect(await pressTab(title, true)).toBe(true);
  expect(document.activeElement).toBe(last);
  if (items == null) {
    title.focus();
    expect(await pressTab(title)).toBe(true);
    expect(document.activeElement).toBe(first);
  }
});

test('reduced motion keeps Home and scrollable content in the keyboard loop', async () => {
  await mount({ motion: { ...motion, reducedMotion: true } });
  const home = button('Home');
  const content = host.querySelector('.sheet-content');
  home.focus();
  // Native Tab can reach the scroll region instead of being trapped on Home.
  expect(await pressTab(home)).toBe(false);
  content.focus();
  expect(await pressTab(content)).toBe(true);
  expect(document.activeElement).toBe(home);
  expect(await pressTab(home, true)).toBe(true);
  expect(document.activeElement).toBe(content);
});

test('suspending Browse preserves its query, scrolling and focus without reopening on other updates', async () => {
  await mount({ items: testInventory });
  await searchFor('glue');
  const dialog = host.querySelector('dialog');
  const content = host.querySelector('.sheet-content');
  const input = host.querySelector('input');
  content.scrollTop = 40;
  input.focus();
  await mount({ items: testInventory, suspended: true });
  expect(dialog.open).toBe(false);
  await mount({ items: testInventory, suspended: true, status: 'offline' });
  expect(dialog.open).toBe(false);
  expect(showModal).toHaveBeenCalledTimes(1);
  await mount({ items: testInventory, suspended: false });
  expect(dialog.open).toBe(true);
  expect(input.value).toBe('glue');
  expect(content.scrollTop).toBe(40);
  expect(document.activeElement).toBe(input);
});

test('a control removed while asleep falls back to the title on waking', async () => {
  await mount({ items: testInventory });
  host.querySelector('input').focus();
  await mount({ items: testInventory, suspended: true });
  opener.focus();
  await mount({ items: null, suspended: true });
  expect(document.activeElement).toBe(opener);
  await mount({ items: null, suspended: false });
  expect(document.activeElement).toBe(host.querySelector('h1'));
});

test('mounting already suspended does not open a modal over the screensaver', async () => {
  await mount({ suspended: true });
  expect(host.querySelector('dialog').open).toBe(false);
  expect(showModal).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(opener);
  await mount({ suspended: false });
  expect(host.querySelector('dialog').open).toBe(true);
  expect(document.activeElement).toBe(host.querySelector('h1'));
});

test('removing a focused search field restores focus inside Browse', async () => {
  await mount({ items: testInventory });
  host.querySelector('input').focus();
  await mount({ items: null });
  expect(document.activeElement).toBe(host.querySelector('h1'));
  expect(host.querySelector('dialog').open).toBe(true);
  expect(showModal).toHaveBeenCalledTimes(1);
});
