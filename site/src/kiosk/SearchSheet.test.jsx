import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import SearchSheet from './SearchSheet.jsx';
import { sampleInventory } from '../mock/sampleInventory.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host;
let root;
let opener;
let showModal;
let close;
const dialogMethods = Object.getOwnPropertyDescriptors(HTMLDialogElement.prototype);

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
  for (const name of ['showModal', 'close']) {
    if (dialogMethods[name]) Object.defineProperty(HTMLDialogElement.prototype, name, dialogMethods[name]);
    else delete HTMLDialogElement.prototype[name];
  }
});

// Undo deadlines below count from time zero.
const clock = () => 0;

async function mount(props = {}, strict = false) {
  const sheet = <SearchSheet items={sampleInventory} onClose={() => root.render(null)} onChange={() => {}} clock={clock} {...props} />;
  await act(async () => root.render(strict ? <StrictMode>{sheet}</StrictMode> : sheet));
}

const button = (label) => [...host.querySelectorAll('button')].find((element) => element.getAttribute('aria-label') === label || element.textContent === label);
const rowFor = (name) => [...host.querySelectorAll('.row')].find((row) => row.querySelector('.row-name').textContent === name);

test.each([false, true])('opens a named modal, focuses its title, labels search, and restores its opener (Strict Mode: %s)', async (strict) => {
  await mount({}, strict);
  const dialog = host.querySelector('dialog');
  const input = host.querySelector('input');
  expect(dialog.open).toBe(true);
  expect(showModal).toHaveBeenCalled();
  expect(document.getElementById(dialog.getAttribute('aria-labelledby')).textContent).toBe('Browse items');
  expect(document.getElementById(dialog.getAttribute('aria-describedby')).textContent).toBe('Sample inventory. Not saved.');
  expect(input.labels[0].textContent).toBe('Search items');
  // The title, so the on-screen keyboard does not open over the list.
  expect(document.activeElement).toBe(host.querySelector('h1'));

  await act(async () => button('Close search').click());
  expect(host.querySelector('dialog')).toBeNull();
  expect(close).toHaveBeenCalled();
  expect(document.activeElement).toBe(opener);
});

test('native Escape cancellation closes through the parent and restores focus', async () => {
  await mount();
  const cancel = new Event('cancel', { cancelable: true });
  await act(async () => host.querySelector('dialog').dispatchEvent(cancel));
  expect(cancel.defaultPrevented).toBe(true);
  expect(host.querySelector('dialog')).toBeNull();
  expect(document.activeElement).toBe(opener);
});

test('Tab wraps between the first and last enabled controls', async () => {
  await mount();
  const first = button('Close search');
  const last = button('Add one pair to Work gloves');
  last.focus();
  const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  await act(async () => last.dispatchEvent(tab));
  expect(tab.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(first);
  const reverseTab = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
  await act(async () => first.dispatchEvent(reverseTab));
  expect(reverseTab.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(last);
});

test('shows units and announces the unit changed by each stock control', async () => {
  const onChange = vi.fn();
  await mount({ onChange });
  expect(rowFor('Deck screws (3")').querySelector('.row-count').textContent).toBe('1 box');
  expect(rowFor('Work gloves').querySelector('.row-count').textContent).toBe('3 pairs');
  await act(async () => button('Add one box to Deck screws (3")').click());
  await act(async () => button('Remove one pair from Work gloves').click());
  expect(onChange.mock.calls).toEqual([
    [{ itemId: 'screws-deck', delta: 1 }],
    [{ itemId: 'gloves-work', delta: -1 }]
  ]);
});

test('zero stock disables removal while preserving addition and tool toggles', async () => {
  const onChange = vi.fn();
  const items = sampleInventory.map((item) => item.id === 'screws-deck' ? { ...item, quantity: 0 } : item);
  await mount({ items, onChange });
  const remove = button('Remove one box from Deck screws (3")');
  expect(remove.disabled).toBe(true);
  expect(rowFor('Deck screws (3")').querySelector('.row-count').textContent).toBe('0 boxes');
  await act(async () => remove.click());
  expect(onChange).not.toHaveBeenCalled();
  expect(button('Add one box to Deck screws (3")').disabled).toBe(false);

  await act(async () => button('Cordless drill is in the shed; tap to change').click());
  expect(onChange).toHaveBeenLastCalledWith({ itemId: 'drill-cordless', out: true });
  await mount({ items: items.map((item) => item.id === 'drill-cordless' ? { ...item, out: true } : item), onChange });
  expect(rowFor('Cordless drill').querySelector('.tool-state').textContent).toBe('Out');
  await act(async () => button('Cordless drill is out of the shed; tap to change').click());
  expect(onChange).toHaveBeenLastCalledWith({ itemId: 'drill-cordless', out: false });
});

test('search filters the rows and reports a query with no matches', async () => {
  await mount();
  const input = host.querySelector('input');
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  const searchFor = async (query) => act(async () => {
    setValue.call(input, query);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await searchFor('pegboard');
  expect([...host.querySelectorAll('.row-name')].map((element) => element.textContent)).toEqual(['Duct tape', 'Cordless drill']);
  await searchFor('missing item');
  expect(host.querySelectorAll('.row')).toHaveLength(0);
  expect(host.querySelector('.sheet-empty').textContent).toBe('Nothing matches “missing item”.');
});

test('feedback renders one Undo and follows remaining time without reopening or moving focus', async () => {
  const onUndo = vi.fn();
  await mount({ notice: 'Updated Work gloves.', undoUntil: 10_000, onUndo });
  const add = button('Add one pair to Work gloves');
  add.focus();
  await mount({ notice: 'Updated Work gloves.', undoUntil: 6_000, onUndo });
  expect(host.querySelectorAll('.undo')).toHaveLength(1);
  expect(host.querySelector('.undo').textContent).toBe('Undo6s');
  expect(host.querySelector('[role="status"]').textContent).toBe('Updated Work gloves.');
  expect(showModal).toHaveBeenCalledTimes(1);
  expect(document.activeElement).toBe(add);
  await act(async () => host.querySelector('.undo').click());
  expect(onUndo).toHaveBeenCalledTimes(1);
  await mount({ notice: 'Last change undone.', onUndo });
  expect(host.querySelector('.undo')).toBeNull();
  expect(host.querySelector('[role="status"]').textContent).toBe('Last change undone.');
});

test('Shift+Tab from the title wraps to the last control rather than leaving the dialog', async () => {
  await mount();
  const title = host.querySelector('h1');
  expect(document.activeElement).toBe(title);
  const reverseTab = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
  await act(async () => title.dispatchEvent(reverseTab));
  expect(reverseTab.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(button('Add one pair to Work gloves'));
});

test('when a focused Undo goes away, focus returns to the title, inside the dialog', async () => {
  await mount({ notice: 'Updated Work gloves.', undoUntil: 3_000, onUndo: () => {} });
  host.querySelector('.undo').focus();
  await mount({ notice: 'Updated Work gloves.', onUndo: () => {} });
  expect(document.activeElement).toBe(host.querySelector('h1'));
});

// jsdom lays nothing out, so the notice is made to overflow its box by hand.
// In a browser that makes it a scroller, which is a Tab stop of its own.
function overflow(element) {
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: 151 });
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: 141 });
  element.tabIndex = 0;
}

const pressTab = async (element, shiftKey = false) => {
  const tab = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
  await act(async () => element.dispatchEvent(tab));
  return tab.defaultPrevented;
};

test('Shift+Tab from Undo and from an overflowing notice moves back toward the inventory, not between them', async () => {
  await mount({ notice: 'Updated LED bulbs (A19, 60W equivalent).', undoUntil: 10_000, onUndo: () => {} });
  const notice = host.querySelector('[role="status"]');
  overflow(notice);
  const undo = host.querySelector('.undo');
  undo.focus();
  // The browser moves focus back to the notice, and from there to the last row.
  expect(await pressTab(undo, true)).toBe(false);
  notice.focus();
  expect(await pressTab(notice, true)).toBe(false);
  // Undo is still the last stop, so forward Tab from it wraps.
  undo.focus();
  expect(await pressTab(undo)).toBe(true);
  expect(document.activeElement).toBe(button('Close search'));
  expect(await pressTab(button('Close search'), true)).toBe(true);
  expect(document.activeElement).toBe(undo);
});

test('an overflowing notice with no Undo is the last stop in both directions', async () => {
  await mount({ notice: 'Updated LED bulbs (A19, 60W equivalent).' });
  const notice = host.querySelector('[role="status"]');
  overflow(notice);
  const first = button('Close search');
  const lastControl = button('Add one pair to Work gloves');
  // The browser moves on from the last row to the notice.
  lastControl.focus();
  expect(await pressTab(lastControl)).toBe(false);
  notice.focus();
  expect(await pressTab(notice)).toBe(true);
  expect(document.activeElement).toBe(first);
  expect(await pressTab(first, true)).toBe(true);
  expect(document.activeElement).toBe(notice);
  host.querySelector('h1').focus();
  expect(await pressTab(host.querySelector('h1'), true)).toBe(true);
  expect(document.activeElement).toBe(notice);
});

// jsdom lays nothing out and loads no stylesheet, so the rectangles and the
// stylesheet's scroll padding (--focus-gutter, 8px) are given by hand.
test('a notice that covers the focused row scrolls it clear by the focus gutter', async () => {
  await mount();
  const content = host.querySelector('.sheet-content');
  const control = button('Add one pair to Work gloves');
  control.focus();
  const styleOf = window.getComputedStyle;
  const spy = vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
    const style = styleOf(element, pseudo);
    return element === content ? { ...style, scrollPaddingTop: '8px' } : style;
  });
  content.getBoundingClientRect = () => ({ top: 100, bottom: 400 });
  control.getBoundingClientRect = () => ({ top: 350, bottom: 402 });
  content.scrollTop = 0;
  await mount({ notice: 'Updated Work gloves.', undoUntil: 10_000, onUndo: () => {} });
  spy.mockRestore();
  // 2px hidden, plus the 8px the outline needs.
  expect(content.scrollTop).toBe(10);
});
