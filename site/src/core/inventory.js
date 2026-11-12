/**
 * The inventory model, as plain functions over a list of items.
 *
 * An item:
 *   { id, name, aliases: [..], kind: 'stock' | 'tool', location: { area, spot },
 *     quantity, unit, lowAt?, out? }
 *
 * `stock` is counted (bulbs, screws); a `tool` is one thing that is either in
 * the shed or out of it. Every change is a record, never an overwrite, so any
 * change can be undone and the history read back:
 *
 *   { itemId, delta }       for stock, a count up or down
 *   { itemId, out: bool }   for a tool, taken or returned
 *
 * The backend will hold the same records in its table; this file is what the
 * kiosk and the backend agree on.
 */

/** The item `change` names, with the change applied. Never below zero. */
export function applyChange(items, change) {
  return items.map((item) => {
    if (item.id !== change.itemId) return item;
    if ('out' in change) return { ...item, out: change.out };
    return { ...item, quantity: Math.max(0, item.quantity + change.delta) };
  });
}

/** The change that undoes `change`, given the item as it was before it. */
export function inverseOf(change, before) {
  if ('out' in change) return { itemId: change.itemId, out: Boolean(before.out) };
  return { itemId: change.itemId, delta: before.quantity - Math.max(0, before.quantity + change.delta) };
}

/** "12 bulbs", "1 box", or "in the shed" / "out" for a tool. */
export function describeStock(item) {
  if (item.kind === 'tool') return item.out ? 'out of the shed' : 'in the shed';
  const unit = item.quantity === 1 ? item.unit : `${item.unit}s`;
  return `${item.quantity} ${unit}`;
}

export function isLow(item) {
  return item.kind === 'stock' && item.lowAt != null && item.quantity <= item.lowAt;
}

const words = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
// "bulbs" finds "bulb", "boxes" finds "box".
const stem = (w) => w.replace(/(es|s)$/, '');

/** Items whose name, aliases or location match every word of `query`. */
export function search(items, query) {
  const terms = words(query).map(stem);
  if (terms.length === 0) return items;
  return items.filter((item) => {
    const hay = words([item.name, ...item.aliases, item.location.area, item.location.spot].join(' ')).map(stem);
    return terms.every((t) => hay.some((h) => h.startsWith(t)));
  });
}

/** Items grouped by location area, in the order the areas first appear. */
export function byArea(items) {
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.location.area)) groups.set(item.location.area, []);
    groups.get(item.location.area).push(item);
  }
  return [...groups].map(([area, list]) => ({ area, items: list }));
}
