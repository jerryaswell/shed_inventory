/**
 * The API's entry point. Routes on the HTTP API's routeKey ("GET /health").
 *
 * Only the liveness route exists so far. It reads nothing: the inventory
 * routes arrive with the kiosk's sign-in, behind an authorizer, and the
 * voice route (speech to text, then a language model that picks an item and
 * an action from the inventory, then this code applying it) after that.
 */
import { json } from './respond.js';

// A Map, not an object: a routeKey such as "constructor" or "toString" must
// not find an inherited member and be called as a route.
const routes = new Map([
  ['GET /health', async () => json(200, { ok: true })]
]);

export async function handler(event) {
  const route = routes.get(event?.routeKey);
  if (!route) return json(404, { error: 'not found' });
  try {
    return await route(event);
  } catch (err) {
    // The name only: a message can quote the request.
    console.error(JSON.stringify({ level: 'error', route: event.routeKey, error: err?.name ?? 'Error' }));
    return json(500, { error: 'internal error' });
  }
}
