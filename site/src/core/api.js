/**
 * Calls to the backend. Only the liveness check exists so far; the inventory
 * and voice routes come with the kiosk's sign-in.
 */
export async function checkHealth(apiBase, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(`${apiBase}/health`, { cache: 'no-store' });
    if (!res.ok) return false;
    const body = await res.json();
    return body?.ok === true;
  } catch {
    return false;
  }
}
