/**
 * A stand-in for the voice route, so the kiosk can be built and tried before
 * the backend exists. It reads a sentence and answers in the shape the real
 * route will:
 *
 *   { action: 'find' | 'take' | 'return' | 'clarify' | 'unknown',
 *     heard, reply, itemId?, change?, options?: [{ itemId, label }],
 *     pending?: { action, quantity } }
 *
 * The real route sends the transcript and the inventory to a language model,
 * which picks an item and an action from the list; the backend then checks
 * the pick and applies the change. Here, a few keyword rules do the picking.
 * None of this file ships behind a deployed API.
 */
import { describeStock, plural, search } from '../core/inventory.js';

const NUMBERS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, couple: 2 };
const FILLER = new Set(['i', 'im', 'am', 'the', 'a', 'an', 'my', 'some', 'any', 'of', 'do', 'have', 'we', 'is', 'are', 'where', 'wheres', 'whats', 'find', 'looking', 'for', 'taking', 'take', 'took', 'grabbing', 'returning', 'return', 'putting', 'back', 'brought', 'got', 'it', 'there', 'please', 'out']);

function intentOf(text) {
  if (/\b(return|returning|putting back|put back|brought back|bringing back)\b/.test(text)) return 'return';
  if (/\b(take|taking|took|grab|grabbing|using)\b/.test(text)) return 'take';
  return 'find';
}

function quantityOf(text) {
  const digits = /\b(\d+)\b/.exec(text);
  if (digits) return Number(digits[1]);
  for (const w of text.split(/\s+/)) if (NUMBERS[w] && w !== 'a' && w !== 'an') return NUMBERS[w];
  return 1;
}

const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function where(item) {
  return `${item.location.area}, ${item.location.spot.toLowerCase()}`;
}

/** The answer for one item and one action. */
export function resolve(item, action, quantity, heard) {
  if (action === 'find') {
    const state = item.kind === 'tool' && item.out ? `It's out of the shed right now. It lives on ${where(item)}.` : `${where(item)}. ${capital(describeStock(item))}.`;
    return { action, heard, itemId: item.id, reply: `${item.name}: ${state}` };
  }
  if (item.kind === 'tool') {
    const out = action === 'take';
    if (Boolean(item.out) === out) {
      return { action: 'unknown', heard, itemId: item.id, reply: out ? `The ${item.name.toLowerCase()} is already marked as out.` : `The ${item.name.toLowerCase()} is already in the shed.` };
    }
    return {
      action, heard, itemId: item.id, change: { itemId: item.id, out },
      reply: out ? `Marked the ${item.name.toLowerCase()} as out. Put it back on ${where(item)}.` : `Thanks. The ${item.name.toLowerCase()} goes back on ${where(item)}.`
    };
  }
  const delta = action === 'take' ? -quantity : quantity;
  const left = Math.max(0, item.quantity + delta);
  const unit = left === 1 ? item.unit : plural(item.unit);
  const verb = action === 'take' ? 'Took' : 'Put back';
  return {
    action, heard, itemId: item.id, change: { itemId: item.id, delta },
    reply: `${verb} ${quantity} × ${item.name}. ${left} ${unit} left.${item.lowAt != null && left <= item.lowAt ? ' Running low.' : ''}`
  };
}

/** Read one sentence against the inventory. */
export function interpret(sentence, items) {
  const text = sentence.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const action = intentOf(text);
  const quantity = quantityOf(text);
  const terms = text.split(' ').filter((w) => !FILLER.has(w) && !(w in NUMBERS) && !/^\d+$/.test(w));
  // Any one term that matches, best match first: "three lightbulbs" names no
  // item exactly but matches every bulb.
  const scored = items
    .map((item) => ({ item, score: terms.filter((t) => search([item], t).length > 0).length }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  const best = scored.filter((s) => s.score === scored[0]?.score).map((s) => s.item);

  if (best.length === 0) {
    return { action: 'unknown', heard: sentence, reply: "I couldn't find that. Try saying it another way, or search instead." };
  }
  if (best.length > 1) {
    return {
      action: 'clarify', heard: sentence, pending: { action, quantity },
      reply: 'Which one did you mean?',
      options: best.map((i) => ({ itemId: i.id, label: i.name }))
    };
  }
  return resolve(best[0], action, quantity, sentence);
}
