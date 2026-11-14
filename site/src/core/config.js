/**
 * The deployed site's runtime config, /config.json, which the deploy writes
 * beside the bundle after the apply (.github/workflows/deploy.yml). It holds
 * the API's base URL.
 *
 * Nothing serves one locally: the dev server answers /config.json with
 * index.html (its SPA fallback), and a missing file is a 404. Both mean
 * "nothing deployed here": loadConfig gives null, and the page runs on its
 * sample inventory.
 *
 * Anything else that fails to give a usable apiBase (a request that does not
 * complete, another error status, malformed JSON, an apiBase that is not an
 * https origin) is a deployment whose config could not be read, not one with
 * none: loadConfig throws, so the status can say so. The page still runs on
 * its sample inventory.
 */
export class ConfigUnavailableError extends Error {
  constructor(reason) {
    super(`config.json unavailable: ${reason}`);
    this.name = 'ConfigUnavailableError';
  }
}

export async function loadConfig(fetchImpl = fetch) {
  let res;
  try {
    res = await fetchImpl('/config.json', { cache: 'no-store' });
  } catch {
    throw new ConfigUnavailableError('request failed');
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new ConfigUnavailableError(`HTTP ${res.status}`);
  if (!(res.headers.get('content-type') ?? '').includes('json')) return null;
  const body = await res.json().catch(() => {
    throw new ConfigUnavailableError('malformed JSON');
  });
  if (typeof body?.apiBase !== 'string' || !/^https:\/\/[^/]+$/.test(body.apiBase)) {
    throw new ConfigUnavailableError('no usable apiBase');
  }
  return { apiBase: body.apiBase };
}
