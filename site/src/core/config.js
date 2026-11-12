/**
 * The deployed site's runtime config, /config.json, which the deploy writes
 * beside the bundle after the apply (.github/workflows/deploy.yml). It holds
 * the API's base URL.
 *
 * Nothing serves one locally: the dev server answers /config.json with
 * index.html (its SPA fallback), and a missing file is a 404. Both mean
 * "nothing deployed here", and the page runs on its sample inventory.
 */
export async function loadConfig(fetchImpl = fetch) {
  let res;
  try {
    res = await fetchImpl('/config.json', { cache: 'no-store' });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  if (!(res.headers.get('content-type') ?? '').includes('json')) return null;
  const body = await res.json().catch(() => null);
  if (typeof body?.apiBase !== 'string' || !/^https:\/\/[^/]+$/.test(body.apiBase)) return null;
  return { apiBase: body.apiBase };
}
