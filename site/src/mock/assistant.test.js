import { expect, test } from 'vitest';
import { interpret, resolve } from './assistant.js';
import { applyChange } from '../core/inventory.js';
import { demoScript, sampleInventory } from './sampleInventory.js';

test('finding a thing says where it is', () => {
  const r = interpret("Where's the cordless drill?", sampleInventory);
  expect(r).toMatchObject({ action: 'find', itemId: 'drill-cordless' });
  expect(r.reply).toContain('Pegboard');
  expect(r.change).toBeUndefined();
});

test('taking a tool marks it out, and returning it brings it back', () => {
  expect(interpret("I'm taking the drill", sampleInventory)).toMatchObject({
    action: 'take', change: { itemId: 'drill-cordless', out: true }
  });
  const out = sampleInventory.map((i) => (i.id === 'drill-cordless' ? { ...i, out: true } : i));
  expect(interpret('Returning the drill', out)).toMatchObject({
    action: 'return', change: { itemId: 'drill-cordless', out: false }
  });
});

test('a vague request gets a question back, and the answer applies the count', () => {
  const r = interpret("I'm taking three lightbulbs", sampleInventory);
  expect(r.action).toBe('clarify');
  expect(r.options.map((o) => o.itemId)).toEqual(['bulb-led-a19', 'bulb-par38']);
  expect(r.pending).toEqual({ action: 'take', quantity: 3 });
  const led = sampleInventory.find((i) => i.id === 'bulb-led-a19');
  const picked = resolve(led, r.pending.action, r.pending.quantity, r.heard);
  expect(picked.change).toEqual({ itemId: 'bulb-led-a19', delta: -3 });
  expect(picked.reply).toContain('9 bulbs left');
});

test('quantities in digits and words', () => {
  expect(interpret('taking 2 rolls of duct tape', sampleInventory).change).toEqual({ itemId: 'tape-duct', delta: -2 });
  expect(interpret('taking four bottles of oil', sampleInventory).change).toEqual({ itemId: 'oil-2stroke', delta: -4 });
});

test('something not in the shed is said plainly, with no change', () => {
  const r = interpret('Where is the kayak?', sampleInventory);
  expect(r.action).toBe('unknown');
  expect(r.change).toBeUndefined();
});

test('every line of the demo script, in order, gets an answer', () => {
  let items = sampleInventory;
  for (const line of demoScript) {
    const r = interpret(line, items);
    expect(r.action, line).not.toBe('unknown');
    if (r.change) items = applyChange(items, r.change);
  }
});
