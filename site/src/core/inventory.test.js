import { describe, expect, test } from 'vitest';
import { applyChange, byArea, describeStock, inverseOf, isLow, search } from './inventory.js';
import { sampleInventory } from '../mock/sampleInventory.js';

const find = (items, id) => items.find((i) => i.id === id);

describe('applyChange and inverseOf', () => {
  test('a count goes down, and its inverse puts it back', () => {
    const before = find(sampleInventory, 'bulb-led-a19');
    const change = { itemId: before.id, delta: -3 };
    const after = applyChange(sampleInventory, change);
    expect(find(after, before.id).quantity).toBe(before.quantity - 3);
    const undone = applyChange(after, inverseOf(change, before));
    expect(find(undone, before.id).quantity).toBe(before.quantity);
  });

  test('a count never goes below zero, and undoing it restores the real count', () => {
    const before = find(sampleInventory, 'bulb-par38'); // 3
    const change = { itemId: before.id, delta: -5 };
    const after = applyChange(sampleInventory, change);
    expect(find(after, before.id).quantity).toBe(0);
    expect(find(applyChange(after, inverseOf(change, before)), before.id).quantity).toBe(3);
  });

  test('a tool goes out and comes back', () => {
    const before = find(sampleInventory, 'drill-cordless');
    const change = { itemId: before.id, out: true };
    const after = applyChange(sampleInventory, change);
    expect(find(after, before.id).out).toBe(true);
    expect(find(applyChange(after, inverseOf(change, before)), before.id).out).toBe(false);
  });

  test('other items are the same objects', () => {
    const after = applyChange(sampleInventory, { itemId: 'glue-wood', delta: 1 });
    expect(find(after, 'tape-duct')).toBe(find(sampleInventory, 'tape-duct'));
  });
});

describe('search', () => {
  test('matches names, aliases and plurals', () => {
    expect(search(sampleInventory, 'lightbulbs').map((i) => i.id)).toEqual(['bulb-led-a19', 'bulb-par38']);
    expect(search(sampleInventory, 'drill').map((i) => i.id)).toEqual(['drill-cordless']);
  });

  test('every word must match', () => {
    expect(search(sampleInventory, 'flood bulb').map((i) => i.id)).toEqual(['bulb-par38']);
  });

  test('matches a location', () => {
    expect(search(sampleInventory, 'pegboard').length).toBe(2);
  });

  test('an empty query is everything', () => {
    expect(search(sampleInventory, '  ')).toBe(sampleInventory);
  });
});

test('byArea keeps the order areas first appear in', () => {
  expect(byArea(sampleInventory).map((g) => g.area)).toEqual(['Shelf 2', 'Shelf 3', 'Pegboard', 'Floor', 'Back wall', 'Shelf 1']);
});

test('describeStock and isLow', () => {
  expect(describeStock({ kind: 'stock', quantity: 1, unit: 'box' })).toBe('1 box');
  expect(describeStock({ kind: 'stock', quantity: 12, unit: 'bulb' })).toBe('12 bulbs');
  expect(describeStock({ kind: 'tool', out: true })).toBe('out of the shed');
  expect(isLow({ kind: 'stock', quantity: 2, lowAt: 2 })).toBe(true);
  expect(isLow({ kind: 'stock', quantity: 3, lowAt: 2 })).toBe(false);
  expect(isLow({ kind: 'stock', quantity: 0 })).toBe(false);
});

test.each([
  [0, 'box', '0 boxes'],
  [1, 'box', '1 box'],
  [2, 'box', '2 boxes'],
  [1, 'pair', '1 pair'],
  [3, 'pair', '3 pairs'],
  [2, 'bottle', '2 bottles'],
  [4, 'roll', '4 rolls']
])('describeStock includes the unit for %i %s', (quantity, unit, expected) => {
  expect(describeStock({ kind: 'stock', quantity, unit })).toBe(expected);
});
