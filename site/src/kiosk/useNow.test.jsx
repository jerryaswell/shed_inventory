import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useNow } from './useNow.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host;
let root;
let time;
let hidden;
let renders;

beforeEach(() => {
  vi.useFakeTimers();
  hidden = false;
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  time = 1_000_000; // 40s into a minute
  renders = [];
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const clock = () => time;
const advance = async (ms) => {
  time += ms;
  await act(async () => vi.advanceTimersByTime(ms));
};
const setHidden = async (value) => {
  hidden = value;
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
};

function Probe({ unitMs, origin }) {
  renders.push(useNow(unitMs, clock, origin));
  return null;
}

test('a minute clock reads the time on each minute, not on a tick', async () => {
  await act(async () => root.render(<Probe unitMs={60_000} />));
  expect(renders).toEqual([1_000_000]);
  await advance(19_999);
  expect(renders).toHaveLength(1);
  await advance(1);
  expect(renders).toEqual([1_000_000, 1_020_000]);
  await advance(60_000);
  expect(renders).toEqual([1_000_000, 1_020_000, 1_080_000]);
});

test('a countdown reads the time on the seconds counted from its origin', async () => {
  await act(async () => root.render(<Probe unitMs={1000} origin={1_010_250} />));
  await advance(250);
  expect(renders).toEqual([1_000_000, 1_000_250]);
  await advance(1000);
  expect(renders).toEqual([1_000_000, 1_000_250, 1_001_250]);
});

test('a hidden page schedules nothing, and reads the time again when shown', async () => {
  await act(async () => root.render(<Probe unitMs={60_000} />));
  await setHidden(true);
  expect(vi.getTimerCount()).toBe(0);
  await advance(300_000);
  expect(renders).toHaveLength(1);
  await setHidden(false);
  expect(renders).toEqual([1_000_000, 1_300_000]);
  await advance(20_000);
  expect(renders).toEqual([1_000_000, 1_300_000, 1_320_000]);
});
